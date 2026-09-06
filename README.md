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
- multiplayer QQND: pokoje publiczne/prywatne, kod pokoju, Quick Play, prywatne ręce, reconnect i bot takeover.

## Uruchomienie lokalne

Nie ma bundlera ani zależności frontendowych. Potrzebny jest tylko serwer HTTP, ponieważ aplikacja używa modułów ES.

```bash
npm run serve
```

Następnie otwórz:

```text
http://localhost:8080
```

Testy reguł:

```bash
npm test
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
- `src/multiplayer.js` — klient wspólnego QQND Game Server;
- `src/ui.js` — renderowanie i obsługa interakcji;
- `tests/` — testy regresyjne reguł.

## Status

Pierwsza grywalna wersja jest przygotowana do przeglądu. Przed produkcyjnym wdrożeniem warto jeszcze zrobić szerokie testy automatyczne całych rozgrywek oraz Playwright na typowych rozdzielczościach telefonu, tabletu i desktopu.
