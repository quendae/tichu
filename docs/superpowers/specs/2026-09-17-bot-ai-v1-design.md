# Tichu Bot AI v1 — Design Spec

**Date:** 2026-09-17  
**Client repo:** `quendae/tichu`  
**Server repo:** `quendae/qqnd-game-server`  
**Client branch:** `feature/bot-ai-v1`  
**Depends on:** `quendae/tichu#9` (`feature/multiplayer-e2e`) and deployed server Dog/discarded fix `5f2fa7845831a58d610bf649241dfdad5f354f79`

## 1. Goal

Replace the current minimal Tichu bot policy with a deterministic, team-aware heuristic policy that plays materially better while respecting the same information boundary as a human player.

Bot AI v1 must improve both local/offline bots and authoritative multiplayer bots. The browser and server implementations must use the same decision contract, pass the same scenario fixtures, and remain behaviorally aligned.

The existing simple policy is retained as `baseline` for comparison. The new default policy is `strategic` after it passes the benchmark and rollout gates in this document.

Bot AI v1 is intentionally heuristic. Monte Carlo search / hidden-state rollouts are deferred to a later Bot AI v2.

## 2. Current baseline

The current bot behavior is intentionally simple:

- Grand Tichu: mostly a threshold on high cards.
- Normal Tichu: mostly a threshold on Dragon/Phoenix/high cards.
- Exchange: highest card to partner, two low cards to opponents.
- Play: pick the first/cheapest legal non-bomb option.
- Bombs: normally avoided unless no non-bomb option exists.
- Wish: prefer a rank already duplicated in the bot's remaining hand.
- Dragon gift: choose the first legal opponent.

This baseline is legal and deterministic enough for simulation, but it is not meaningfully team-aware and does not optimize hand structure or endgame pressure.

## 3. Architecture

### 3.1 Pure strategy modules

Client:

`src/bot-strategy.js`

Server:

`src/games/tichu/bot-strategy.ts`

The game engines keep responsibility for legality, state transitions, scoring and scheduling. Strategy modules only select decisions from an already-legal information view.

The strategy modules expose equivalent pure functions:

- `decideGrand(view)`
- `decideTichu(view)`
- `chooseExchange(view)`
- `choosePlay(view)`
- `chooseWish(view)`
- `chooseDragonRecipient(view)`

They also expose hand-analysis helpers needed by tests and benchmarks, such as hand-shape evaluation and estimated exits.

### 3.2 Policy profiles

Two named profiles exist:

- `baseline` — frozen behavior matching the current bot policy closely enough to provide a stable comparison target.
- `strategic` — Bot AI v1.

Local games and authoritative server bots switch to `strategic` only after the benchmark gate is satisfied.

The deterministic simulator can assign a profile per seat/team so `strategic` and `baseline` can play one another in the same match.

### 3.3 BotView information boundary

Strategy does not receive the raw authoritative game state.

`BotView` contains only information available to that bot:

- bot seat and partner seat;
- bot's own exact hand;
- public table / current trick and last play;
- public hand counts of all seats;
- public declarations (Tichu / Grand Tichu);
- scores, round, phase and finish order;
- current player / trick leader;
- public wish;
- public cards already played/discarded when needed for inference;
- public log-derived facts only where those facts cannot reveal private state;
- cards the bot itself sent during exchange;
- cards the bot itself received during exchange.

It must not contain:

- exact opponent or partner hands;
- hidden exchange selections belonging to other players;
- hidden captured cards if the normal player view does not expose them;
- server session/resume credentials or unrelated multiplayer metadata.

### 3.4 No-cheat invariant

For any two authoritative states that produce the same legal `BotView`, strategy output must be identical even when hidden opponent cards are permuted.

Tests must explicitly create such paired states and verify identical decisions for Grand/Tichu, exchange, play, wish and Dragon recipient decisions where applicable.

## 4. Hand analysis

`strategic` computes deterministic features from the visible hand.

Core features:

- estimated number of exits needed to empty the hand;
- count and quality of bombs;
- ready straights, consecutive pairs, full houses, triples and pairs;
- control cards: Dragon, Phoenix, Aces and other high singles;
- low/problem singleton count;
- number of cards participating in useful combinations;
- number of fragile combinations that would be broken by giving/playing a card;
- finishing potential: whether a legal sequence of short remaining exits appears plausible;
- points at risk in the remaining hand.

The evaluator must be deterministic. Equal scores use stable tie-breaks based on card IDs / stable option order, never `Math.random()`.

### 4.1 Estimated exits

The exit estimator is heuristic, not a full solver. It should prefer decompositions that remove many cards while preserving bombs/control.

For v1 it may use a bounded greedy/dynamic scoring pass over legal combinations rather than exhaustive search. The implementation must remain fast enough for browser play and server bot settling.

## 5. Grand Tichu and Tichu decisions

Declarations use a hand-strength score rather than a simple high-card count.

Positive factors include:

- low estimated exit count;
- Dragon / Phoenix / multiple Aces;
- bombs;
- long ready combinations;
- control combined with a short route to emptying the hand.

Negative factors include:

- many low disconnected singletons;
- a high exit estimate;
- high-card strength with no coherent way to shed the rest of the hand;
- excessive dependence on one fragile Phoenix-based combination.

Grand Tichu requires a materially stronger score than normal Tichu because only eight cards are known at declaration time and the reward/risk is doubled.

Match score affects risk tolerance in bounded form:

- a team far behind may lower the declaration threshold modestly;
- a team comfortably ahead may raise it modestly;
- score adjustment must never dominate the hand-quality signal.

All thresholds remain deterministic constants covered by scenario tests.

## 6. Exchange strategy

Exchange decisions optimize the structure of the hand after giving three cards.

### 6.1 General rules

The scorer strongly avoids:

- breaking a bomb;
- breaking a long straight or long pair sequence without compensation;
- breaking a triple/pair that is part of a strong full-house structure;
- donating Dragon/Phoenix to an opponent except in a specifically justified tested case.

The scorer prefers giving opponents cards that:

- reduce weak singleton burden;
- do not break valuable structures;
- have low control value;
- do not obviously strengthen a dangerous opponent based only on public/known exchange information.

### 6.2 Partner support

The partner card is selected separately from opponent cards.

If the partner has declared Tichu/Grand Tichu, the bot significantly increases the value of sending a strong control/support card when doing so does not catastrophically damage its own hand.

Special cards receive explicit heuristics:

- Dog can be highly valuable when partner support / lead transfer matters.
- Mah Jong has strategic lead/wish value and is not treated as merely rank 1.
- Phoenix is a flexible structure/control card and is expensive to give away.
- Dragon is maximum single-card control but may be worth supporting a declared partner in strong cases.

No exchange decision may depend on the exact hidden hands of other seats.

## 7. Play strategy

`choosePlay` scores every legal option produced by the existing rules engine. Legality remains outside the AI.

The score combines:

- immediate hand-out bonus;
- reduction in estimated future exits;
- preservation cost for bombs / strong combinations;
- control-card consumption cost;
- table-point value;
- partner/opponent ownership of the current winning play;
- public hand counts;
- Tichu/Grand declarations;
- risk of enabling or stopping a double victory;
- endgame urgency.

### 7.1 Leading

When opening a trick, strategic AI generally prefers to:

- remove awkward/weak holdings;
- shed efficient multi-card combinations;
- preserve Dragon/Phoenix/Aces unless the control is needed;
- use Dog when lead transfer to partner is strategically valuable;
- avoid destroying a bomb merely to lead cheaply.

### 7.2 Following

When responding, the bot prefers the cheapest meaningful winning option, not simply the first legal option.

If the partner is currently winning and there is no urgent threat, overtaking the partner receives a strong penalty.

The penalty can be overcome when public information shows a clear reason, including:

- an opponent with 1–2 cards must be prevented from going out;
- an opponent with Tichu/Grand Tichu must be stopped;
- partner's current win would lead to a severe endgame disadvantage;
- the bot can immediately go out;
- preventing an opponent double victory.

### 7.3 Bombs

Bombs are valuable control assets, not forbidden moves.

Strategic AI may spend a bomb for a large positive reason, especially:

- the bomb immediately empties the bot's hand;
- it stops an opponent Tichu/Grand Tichu attempt;
- it prevents an opponent double victory;
- it protects the bot's team from an imminent finish;
- it captures or controls a high-value trick when the expected tactical gain clearly exceeds the preservation cost.

Otherwise bombs receive a strong preservation penalty.

## 8. Mah Jong wish

Wish selection may use only legal knowledge:

- bot's own remaining hand;
- cards the bot itself gave away in exchange;
- cards the bot itself received;
- public played/discarded history;
- public declarations and hand counts.

The scorer prefers ranks that are strategically inconvenient for opponents based on known/public information while avoiding wishes the bot itself is likely to be forced to satisfy at a damaging moment.

The algorithm must not infer from exact authoritative opponent hands.

## 9. Dragon recipient

The bot gifts a Dragon trick only to an opponent, as required by the rules.

Among legal opponents it prefers the less dangerous recipient based on public information, including:

- more cards remaining is safer than fewer cards remaining;
- an opponent with active Tichu/Grand Tichu is more dangerous;
- known finish-order/endgame state may change the choice;
- team-score context may act as a small tie-breaker.

Exact hidden cards cannot affect the choice.

## 10. Client/server parity

The JS and TS strategy implementations intentionally remain separate files to avoid introducing a shared package/build dependency for a small heuristic subsystem.

They must nevertheless share an equivalent input/output contract and scenario suite.

A checked-in fixture file contains compact scenarios with:

- normalized `BotView` input;
- requested decision type;
- expected normalized decision/result.

At minimum fixtures cover:

1. strong Grand call;
2. weak Grand pass;
3. strong normal Tichu call;
4. weak normal Tichu pass;
5. exchange does not break a bomb;
6. exchange preserves a valuable long structure;
7. exchange supports a partner who declared Tichu;
8. do not overtake a safely winning partner;
9. overtake when an opponent with one card is an immediate threat;
10. preserve Dragon/Phoenix when a cheaper sufficient move exists;
11. spend a bomb to stop an opponent Tichu;
12. spend a bomb to go out;
13. choose a wish from legal known information;
14. choose the safer Dragon recipient;
15. same visible information + permuted hidden hands => identical decision.

Client and server tests consume equivalent fixture content and normalize result ordering before comparison.

## 11. Benchmark harness

### 11.1 Head-to-head design

The simulator gains per-seat/per-team policy selection.

For every benchmark seed, play a paired comparison:

- Match A: Team 0 `strategic`, Team 1 `baseline`.
- Match B: same seed, team policies swapped.

A full developer benchmark uses **200 seed pairs / 400 matches** by default.

CI uses only a small benchmark smoke (approximately 10–20 seed pairs) for legality, determinism, reporting and runtime. CI does not fail merely because the small statistical sample has a losing strategic win rate.

### 11.2 Metrics

Collect at least:

- match wins by policy;
- average final score differential;
- rounds won / double victories;
- normal Tichu calls, successes and failures;
- Grand Tichu calls, successes and failures;
- average finish position by policy;
- bomb opportunities/uses where measurable without hidden-information leakage;
- average rounds and action count per match;
- invalid/rejected strategy decisions (must remain zero).

Output human-readable text plus machine-readable JSON under a gitignored artifact directory, e.g. `artifacts/bot-benchmarks/`.

### 11.3 Success gate

Bot AI v1 is accepted only if:

1. all game invariants and existing regression tests remain green;
2. all client/server parity fixtures pass;
3. no-cheat hidden-hand permutation tests pass;
4. the 200-pair benchmark gives `strategic` a positive paired head-to-head record;
5. the 200-pair benchmark gives `strategic` a positive average score differential;
6. Tichu/Grand declaration success is not materially worse than baseline without an explained compensating gain;
7. runtime remains practical for browser play and server bot settling.

Do not tune acceptance thresholds to a single seed range. If the benchmark fails, inspect decision categories/metrics, adjust heuristics, and rerun a fresh predefined seed range.

## 12. Tests and TDD

Implementation is test-first.

Client tests:

- pure strategy unit tests;
- fixture tests;
- hidden-hand independence tests;
- deterministic tie-break tests;
- baseline behavior lock tests;
- simulator mixed-policy tests;
- benchmark report tests.

Server tests:

- equivalent strategy scenarios in TypeScript;
- fixture parity contract;
- no hidden-hand dependency;
- integration through `settleTichuBots`;
- bot takeover continues to use strategic policy legally.

Existing deterministic full-match invariants and multiplayer E2E remain mandatory regression gates.

## 13. Integration sequence

1. Freeze/extract the client baseline policy without changing behavior.
2. Build `BotView` and no-cheat tests.
3. Implement strategic hand analysis and declaration scoring in the client.
4. Implement strategic exchange and play scoring in the client.
5. Add benchmark harness and validate strategic vs baseline.
6. Port the same strategy contract/fixtures to `qqnd-game-server`.
7. Run server typecheck/unit/build and client full suite.
8. Deploy server branch only after its PR is approved/merged.
9. Run production multiplayer smoke against `api.qqnd.fyi` to verify authoritative strategic bots.
10. Switch defaults to `strategic` only after all acceptance gates are met.

## 14. README / developer UX

README must document:

- `baseline` vs `strategic` profiles;
- no-hidden-hand-cheating rule;
- local simulation/benchmark commands;
- where benchmark artifacts are written;
- that authoritative online bots live in `qqnd-game-server` and require server deployment;
- that the full benchmark is a developer/manual quality gate, while CI uses a smaller smoke.

## 15. Out of scope for v1

- Monte Carlo / determinization rollouts;
- neural models / external LLM calls;
- online self-learning or persistent player modeling;
- difficulty levels beyond selecting policy/threshold presets;
- use of hidden authoritative opponent hands for stronger play;
- perfect-information solving;
- changing Tichu game rules.

These are candidates for Bot AI v2+ after v1 metrics establish a stable baseline.