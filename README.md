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

## Multiplayer

Klient łączy się z tym samym endpointem co Skat:

```text
wss://api.qqnd.fyi/api/v1/ws
```

Rozgrywka online jest **server-authoritative**: klient wysyła wyłącznie akcje, a serwer tasuje, rozdaje, waliduje ruchy, prowadzi boty i wysyła każdemu graczowi jego prywatny widok stanu. Dzięki temu ręce przeciwników nie są przesyłane do przeglądarki jako jawne dane.

Obsługa Tichu po stronie serwera znajduje się w osobnym repozytorium `quendae/qqnd-game-server` i musi być wdrożona razem z klientem. Integracja zachowuje istniejący mechanizm sesji, pokojów, Quick Play, 60-sekundowego reconnect grace i przejęcia miejsca przez bota.

## Struktura

- `index.html` — szkielet aplikacji i stołu;
- `styles.css` — responsywna oprawa stołu i kart;
- `src/rules.js` — klasyfikacja kombinacji, bomby, Phoenix, życzenia i punktacja;
- `src/game.js` — lokalny przebieg rundy, wymiana, scoring i boty;
- `src/simulation/` — seeded RNG, invarianty, replay i synchroniczny driver symulacji;
- `scripts/simulate.mjs` / `scripts/replay.mjs` — narzędzia developerskie do stress testów i odtwarzania failure;
- `src/multiplayer.js` — klient wspólnego QQND Game Server;
- `src/ui.js` — renderowanie i obsługa interakcji;
- `tests/` — testy reguł, regresji, symulacji oraz Playwright dla UI.

## Status

Wersja lokalna ma pokrycie jednostkowe/regresyjne, deterministyczne pełne rozgrywki bot-vs-bot oraz Playwright na typowych rozdzielczościach telefonu, tabletu i desktopu. Następnym większym etapem po domknięciu tego harnessu jest pełne E2E multiplayer przez QQND Game Server, a potem dalsze ulepszanie strategii botów.
