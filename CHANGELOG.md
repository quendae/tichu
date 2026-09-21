# Changelog

## 1.0.0 — 2026-09-21

Pierwsze stabilne wydanie przeglądarkowej wersji Tichu.

### Gra

- pełna talia 56 kart i czteroosobowa rozgrywka drużynowa;
- Grand Tichu, Tichu, wymiana kart, punktacja rund i mecz do 1000 punktów;
- single, pary, trójki, full house, strity, kolejne pary i bomby;
- Mah Jong z życzeniem, Dog, Phoenix i Dragon;
- bomby zagrywane poza kolejnością;
- lokalna rozgrywka 1 gracz + 3 boty.

### Bot AI v1

- profil `strategic` jako domyślna strategia lokalna i server-authoritative;
- brak dostępu bota do ukrytych rąk przeciwników;
- deterministic parity fixtures klient/serwer;
- pełny benchmark acceptance: 200 par / 400 meczów, 261:139 zwycięstw `strategic` vs `baseline`, średnio +288.07 punktu na mecz, 0 rejected decisions.

### Multiplayer

- server-authoritative multiplayer przez QQND Game Server;
- pokoje prywatne/publiczne, kod pokoju i Quick Play;
- prywatne ręce i redakcja stanu po stronie serwera;
- reconnect grace, odzyskanie miejsca oraz substitute-bot takeover;
- obsługa pełnych meczów 4H, 2H+2B oraz meczu kontynuowanego po takeover;
- edge-case coverage dla deklaracji, wymiany, Mah Jong wish, Dog, Phoenix, Dragon i out-of-turn bombs;
- poprawiony lifecycle zakończonych authoritative pokojów po `match-end` w `qqnd-game-server` (produkcyjny backend `8f7cc33`).

### UI i kompatybilność

- responsywny desktop, tablet portrait/landscape i telefon;
- Chromium, Firefox i WebKit acceptance;
- czytelniejsze stany lobby, reconnect/takeover oraz komunikaty zakończenia rundy i meczu;
- poprawki Firefox CSS geometry i stabilizacja interakcji Coach podczas rerenderu.

### Release acceptance

Ostatni produkcyjny soak na kliencie `d11c751` po wdrożeniu backendu `8f7cc33`:

- 3/3 scenariusze PASS w 6.6 min;
- 4/4 pełne mecze zakończone;
- 2320 akcji i 52 rundy;
- 4/4 reconnecty;
- 0 client errors;
- churn: 8 utworzonych unikalnych pokojów i 8/8 kodów odrzuconych po cleanupie;
- substitute-bot takeover PASS.

Poza soak release bazuje na wcześniej zaakceptowanych gate'ach: pełne mecze multiplayer, edge cases, cross-browser/device acceptance i multiplayer UX.

### Odłożone po 1.0

- Bot AI v2;
- spectator mode;
- replay/history dla graczy;
- rematch;
- statystyki/rankingi/konta.
