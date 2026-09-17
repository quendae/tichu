# Tichu

Przeglądarkowa wersja klasycznego **Tichu** dla czterech graczy. Projekt korzysta z tej samej infrastruktury multiplayer QQND co `quendae/Skat`, ale ma osobny silnik reguł i własną oprawę stołu.

## Co jest zaimplementowane

- lokalna gra 1 gracz + 3 boty;
- pełna talia 56 kart i partnerzy siedzący naprzeciwko siebie;
- rozdanie 8 + 6 kart z oknem **Grand Tichu**;
- wymiana po jednej karcie z każdym z pozostałych graczy;
- single, pary, trójki, full house, strity i kolejne pary;
- bomby: kareta oraz poker/straight flush 5+;
- **Mah Jong** z życzeniem, **Dog**, **Phoenix** i **Dragon**;
- bomby zagrywane poza kolejnością;
- Tichu ±100 i Grand Tichu ±200;
- double victory 200:0, punktacja kart i mecz do 1000 punktów;
- responsywny stół dla desktopu, tabletu i telefonu;
- dziennik gry i skrócone zasady w interfejsie;
- multiplayer QQND: pokoje publiczne/prywatne, kod pokoju, Quick Play, prywatne ręce, reconnect i bot takeover;
- deterministyczny headless simulator pełnych meczów z invariantami i developerskim replayem błędów.

## Uruchomienie lokalne

Nie ma bundlera ani zależności frontendowych. Potrzebny jest tylko serwer HTTP, ponieważ aplikacja używa modułów ES.

```bash
npm run serve
```

Następnie otwórz:

```text
http://localhost:8080
```

Testy reguł i regresji:

```bash
npm test
```

## Testy deterministyczne i replay

CI uruchamia dodatkowy smoke test 20 pełnych, deterministycznych meczów bot-vs-bot:

```bash
npm run test:sim
```

Większy lokalny przebieg można uruchomić bez przeglądarki, np.:

```bash
npm run sim -- --matches 100 --seed 1
npm run sim -- --matches 1000 --seed 1 --quiet
```

Każdy mecz korzysta z zapisanego seeda, sprawdza invarianty stanu po każdej zmianie i zatrzymuje batch na pierwszym błędzie. Przy failure pełny developerski replay jest zapisywany w `artifacts/replays/`. Plik zawiera ukryte ręce wszystkich graczy i służy wyłącznie do diagnostyki; katalog jest ignorowany przez Git.

Odtworzenie zapisanego przypadku:

```bash
npm run replay -- artifacts/replays/failure-seed-738.json
```

## Bot AI

Aktualne boty są legalne i deterministyczne, ale ich strategia jest celowo prosta: Grand/Tichu opierają się głównie na liczbie mocnych kart, wymiana jest schematyczna, a podczas gry bot zwykle wybiera najtańszy legalny ruch i zachowuje bomby.

Na branchu `feature/bot-ai-v1` rozwijany jest **Bot AI v1** z dwoma profilami:

- `baseline` — zamrożone obecne zachowanie używane jako punkt odniesienia;
- `strategic` — nowa deterministyczna strategia uwzględniająca strukturę ręki, liczbę przewidywanych wyjść, grę partnera, deklaracje Tichu/Grand Tichu, zagrożenie końcówką, użycie bomb, Mah Jong wish i wybór odbiorcy Dragon.

Najważniejszą zasadą jest **brak oszukiwania przez ukryty stan**. Strategiczny bot może korzystać tylko z własnej ręki, publicznego stanu gry i informacji, które sam poznał podczas wymiany. Przetasowanie ukrytych kart innych graczy przy zachowaniu tego samego widoku bota nie może zmienić jego decyzji.

Bot AI v1 będzie utrzymywany równolegle w kliencie i w authoritative `qqnd-game-server`. Obie implementacje będą sprawdzane tym samym logicznym zestawem parity fixtures, aby bot lokalny i bot online podejmowały równoważne decyzje.

Jako quality gate powstaje benchmark `strategic` vs `baseline` na tych samych seedach z zamianą stron. Pełny developerski benchmark ma rozgrywać 200 par seedów / 400 meczów i raportować m.in. win rate, średnią różnicę punktów, skuteczność Tichu/Grand, double victories i średnią kolejność wychodzenia. CI będzie uruchamiać tylko mniejszy smoke benchmarku; pełny przebieg pozostanie ręcznym testem jakości.

Pełny zaakceptowany projekt znajduje się w:

```text
docs/superpowers/specs/2026-09-17-bot-ai-v1-design.md
```

## Multiplayer

Klient łączy się z tym samym endpointem co Skat:

```text
wss://api.qqnd.fyi/api/v1/ws
```

Rozgrywka online jest **server-authoritative**: klient wysyła wyłącznie akcje, a serwer tasuje, rozdaje, waliduje ruchy, prowadzi boty i wysyła każdemu graczowi jego prywatny widok stanu. Dzięki temu ręce przeciwników nie są przesyłane do przeglądarki jako jawne dane.

Obsługa Tichu po stronie serwera znajduje się w osobnym repozytorium `quendae/qqnd-game-server` i musi być wdrożona razem z klientem. Integracja zachowuje istniejący mechanizm sesji, pokojów, Quick Play, 60-sekundowego reconnect grace i przejęcia miejsca przez bota.

### Multiplayer E2E

Domyślny CI uruchamia ograniczony test produkcyjny przeciw `wss://api.qqnd.fyi/api/v1/ws`. Test tworzy unikalny prywatny pokój, dwa izolowane konteksty przeglądarki reprezentujące ludzi oraz dwa boty serwerowe, sprawdza prywatność rąk, synchronizację stanu i reconnect:

```bash
npm run test:e2e:multiplayer
```

Cięższy smoke z czterema ludźmi oraz przejęciem rozłączonego miejsca przez bota jest celowo ręczny, ponieważ produkcyjny reconnect grace trwa 60 sekund:

```bash
npm run test:e2e:multiplayer:full
```

Bridge testowy istnieje wyłącznie przy `?e2e=1` i udostępnia tylko stan już zredagowany dla bieżącego gracza oraz bezpieczny status bez tokenów sesji. Testy tworzą wyłącznie własne prywatne pokoje z unikalnymi nazwami i nie modyfikują cudzych pokojów. Po nieudanym przebiegu prywatny pokój lub sesja mogą pozostać do automatycznego cleanupu TTL po stronie serwera.

## Struktura

- `index.html` — szkielet aplikacji i stołu;
- `styles.css` — responsywna oprawa stołu i kart;
- `src/rules.js` — klasyfikacja kombinacji, bomby, Phoenix, życzenia i punktacja;
- `src/game.js` — lokalny przebieg rundy, wymiana, scoring i boty;
- `src/simulation/` — seeded RNG, invarianty, replay i synchroniczny driver symulacji;
- `scripts/simulate.mjs` / `scripts/replay.mjs` — narzędzia developerskie do stress testów i odtwarzania failure;
- `src/multiplayer.js` — klient wspólnego QQND Game Server;
- `src/e2e-bridge.js` — bezpieczny bridge developerski aktywowany wyłącznie przez `?e2e=1`;
- `src/ui.js` — renderowanie i obsługa interakcji;
- `tests/` — testy reguł, regresji, symulacji oraz Playwright dla UI;
- `tests/e2e-multiplayer/` — produkcyjne scenariusze multiplayer 2H+2B, 4H i bot takeover.

## Status

Projekt ma pokrycie jednostkowe/regresyjne, deterministyczne pełne rozgrywki bot-vs-bot, responsywne Playwright E2E oraz produkcyjne testy multiplayer przez QQND Game Server. Bounded 2H+2B z reconnect działa w domyślnym CI, a cięższe 4H i 60-sekundowy bot takeover pozostają ręcznym smoke testem. Aktualnym etapem rozwoju jest Bot AI v1: wydzielenie `baseline`, implementacja `strategic`, parity klient/serwer oraz benchmark strategic vs baseline przed przełączeniem authoritative botów na nową strategię.
