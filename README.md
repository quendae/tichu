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
- deterministyczny headless simulator pełnych meczów z invariantami i developerskim replayem błędów;
- **Bot AI v1** z profilem `strategic`, parity client/server i benchmarkiem `strategic` vs `baseline`.

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

## Bot AI v1

Bot AI ma dwa deterministyczne profile:

- `baseline` — zamrożone starsze zachowanie, zachowane jako punkt odniesienia i regresyjny przeciwnik benchmarkowy;
- `strategic` — domyślna strategia bota, uwzględniająca strukturę ręki, przewidywaną liczbę wyjść, kontrolę wysokimi kartami, bomby, grę partnera, deklaracje Tichu/Grand Tichu, zagrożenia końcówką, wymianę kart, Mah Jong wish i wybór odbiorcy Dragon.

Strategia jest zaimplementowana niezależnie w kliencie (`src/bot-strategy.js`) oraz w authoritative `qqnd-game-server`. Silnik reguł nadal jest jedynym źródłem legalnych ruchów — Bot AI tylko wybiera spośród przekazanych legalnych opcji.

Najważniejszą zasadą jest **brak oszukiwania przez ukryty stan**. Bot może korzystać wyłącznie z własnej ręki, publicznego stanu gry oraz informacji, które sam poznał podczas wymiany. Canonical parity fixtures oraz test permutacji ukrytych rąk sprawdzają, że zmiana niewidocznych kart przeciwników nie wpływa na `BotView` ani decyzję strategiczną.

Canonical fixture contract:

```text
version: 1
scenario SHA-256: d39c66aa58cda14ecbd8311f42de86329b90e4d42f0252e55b152f3244a263d0
```

### Benchmark

CI uruchamia krótki paired smoke benchmark:

```bash
npm run test:bot-benchmark
```

Pełny benchmark można uruchomić ręcznie:

```bash
npm run bot:benchmark -- --pairs 200 --seed 20001 --validate
```

Benchmark wykonuje dla każdego seeda dwa mecze ze zmianą stron `strategic ↔ baseline`, dzięki czemu wynik nie zależy od przypisania miejsc. Raport JSON i tekstowy trafiają do `artifacts/bot-benchmarks/`.

Finalny acceptance Bot AI v1 został wykonany na wcześniej nietkniętym bloku seedów `20001..20200` — **200 par / 400 meczów**:

- match wins `strategic / baseline / ties`: **261 / 139 / 0**;
- pair wins: **140 / 59 / 1**;
- średnia różnica punktów strategic minus baseline: **+288.07 / mecz**;
- aggregate paired differential: **+115230**;
- declaration net: **+26000 / -145200**;
- średnia kolejność wyjścia: **2.486 / 2.514**;
- rejected decisions: **0**;
- decision timing avg / max: **6.033 / 217.640 ms**;
- validation status: **PASS**.

Projekt strategii i plan implementacji znajdują się w:

```text
docs/superpowers/specs/2026-09-17-bot-ai-v1-design.md
docs/superpowers/plans/2026-09-17-bot-ai-v1-implementation.md
```

## Multiplayer

Klient łączy się z tym samym endpointem co Skat:

```text
wss://api.qqnd.fyi/api/v1/ws
```

Rozgrywka online jest **server-authoritative**: klient wysyła wyłącznie akcje, a serwer tasuje, rozdaje, waliduje ruchy, prowadzi boty i wysyła każdemu graczowi jego prywatny widok stanu. Dzięki temu ręce przeciwników nie są przesyłane do przeglądarki jako jawne dane.

Obsługa Tichu po stronie serwera znajduje się w osobnym repozytorium `quendae/qqnd-game-server`. Server Bot AI v1 został zmergowany jako PR #11; authoritative boty używają domyślnie profilu `strategic`. `baseline` pozostaje dostępny do testów i porównań.

Integracja zachowuje istniejący mechanizm sesji, pokojów, Quick Play, 60-sekundowego reconnect grace i przejęcia miejsca przez bota.

### Multiplayer E2E

Domyślny CI uruchamia ograniczony test produkcyjny przeciw `wss://api.qqnd.fyi/api/v1/ws`. Test tworzy unikalny prywatny pokój, dwa izolowane konteksty przeglądarki reprezentujące ludzi oraz dwa boty serwerowe, sprawdza prywatność rąk, synchronizację stanu i reconnect:

```bash
npm run test:e2e:multiplayer
```

Cięższy smoke z czterema ludźmi oraz przejęciem rozłączonego miejsca przez bota jest celowo ręczny, ponieważ produkcyjny reconnect grace trwa 60 sekund:

```bash
npm run test:e2e:multiplayer:full
```

Po wdrożeniu strategicznego server defaultu oba rollout gates zostały wykonane przeciw produkcji: bounded **2H+2B** oraz full **4H + bot takeover** zakończyły się powodzeniem.

Bridge testowy istnieje wyłącznie przy `?e2e=1` i udostępnia tylko stan już zredagowany dla bieżącego gracza oraz bezpieczny status bez tokenów sesji. Testy tworzą wyłącznie własne prywatne pokoje z unikalnymi nazwami i nie modyfikują cudzych pokojów. Po nieudanym przebiegu prywatny pokój lub sesja mogą pozostać do automatycznego cleanupu TTL po stronie serwera.

## Struktura

- `index.html` — szkielet aplikacji i stołu;
- `styles.css` — responsywna oprawa stołu i kart;
- `src/rules.js` — klasyfikacja kombinacji, bomby, Phoenix, życzenia i punktacja;
- `src/game.js` — lokalny przebieg rundy, wymiana, scoring i integracja botów;
- `src/bot-strategy.js` — profile `baseline` / `strategic`, analiza ręki i decyzje Bot AI;
- `src/simulation/` — seeded RNG, invarianty, replay, synchroniczny driver i agregacja benchmarku;
- `scripts/simulate.mjs` / `scripts/replay.mjs` — stress testy i odtwarzanie failure;
- `scripts/benchmark-bots.mjs` — paired benchmark `strategic` vs `baseline` i raporty acceptance;
- `src/multiplayer.js` — klient wspólnego QQND Game Server;
- `src/e2e-bridge.js` — bezpieczny bridge developerski aktywowany wyłącznie przez `?e2e=1`;
- `src/ui.js` — renderowanie i obsługa interakcji;
- `tests/fixtures/bot-strategy-v1.json` — canonical parity fixture corpus;
- `tests/` — testy reguł, Bot AI, regresji, symulacji oraz Playwright dla UI;
- `tests/e2e-multiplayer/` — produkcyjne scenariusze multiplayer 2H+2B, 4H i bot takeover.

## Status

Bot AI v1 przeszedł pełny acceptance, parity client/server, no-cheat boundary, timing guardrail oraz produkcyjny rollout smoke. Profil `strategic` jest domyślny dla botów lokalnych i authoritative botów serwera, a `baseline` pozostaje zamrożonym profilem referencyjnym. Projekt nadal ma deterministyczne pełne symulacje, responsive Playwright E2E i produkcyjne testy multiplayer przez QQND Game Server.
