# Tichu Bot AI v1 — Design Spec

**Date:** 2026-09-17  
**Client repo:** `quendae/tichu`  
**Server repo:** `quendae/qqnd-game-server`  
**Client branch:** `feature/bot-ai-v1`  
**Stacked on:** `quendae/tichu#9` (`feature/multiplayer-e2e`)  
**Server prerequisite already deployed:** Dog/discarded fix `5f2fa7845831a58d610bf649241dfdad5f354f79`

## 1. Goal

Replace the current minimal Tichu bot policy with a deterministic, team-aware heuristic policy that plays materially better while respecting the same information boundary as a human player.

Bot AI v1 must improve both local/offline bots and authoritative multiplayer bots. The browser and server implementations must use the same decision contract, pass the same scenario fixtures, and remain behaviorally aligned.

The existing simple policy is retained as `baseline` for comparison. The new default policy becomes `strategic` only after it passes the benchmark, parity, regression and production rollout gates in this document.

Bot AI v1 is intentionally heuristic. Monte Carlo search / hidden-state rollouts are deferred to a later Bot AI v2.

The client branch is stacked on PR #9. Bot AI work must not be merged to `main` before PR #9 is merged or the Bot AI branch is rebased onto an equivalent `main` containing that work.

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

Local games and authoritative server bots switch to `strategic` only after the acceptance gates are satisfied.

The deterministic simulator can assign a profile per seat/team so `strategic` and `baseline` can play one another in the same match.

### 3.3 BotView information boundary

Strategy does not receive the raw authoritative game state.

`BotView` contains only information available to that bot:

- bot seat and partner seat;
- bot's own exact current hand;
- public table / current trick and last play;
- public hand counts of all seats;
- public declarations (Tichu / Grand Tichu);
- scores, round, phase and finish order;
- current player / trick leader;
- public wish;
- public cards already played/discarded when needed for inference;
- public log-derived facts only where those facts cannot reveal private state;
- IDs of cards that this bot itself sent during the current round's exchange, derived only from its own exchange map.

Cards received in exchange do not require separate memory because they become part of the bot's own exact hand.

`BotView` must not contain:

- exact opponent or partner hands;
- exchange selections belonging to other players;
- hidden captured cards if the normal player view does not expose them;
- server session/resume credentials or unrelated multiplayer metadata.

The authoritative engine may build `BotView` from its complete internal state, but the builder must select only the fields above. It must never pass the raw state object into strategy code.

### 3.4 No-cheat invariant

For any two authoritative states that contain the same legal information for a bot, `buildBotView` must produce equivalent views and strategy output must be identical even when hidden opponent cards are permuted.

Tests must explicitly create such paired states and verify both:

1. normalized `BotView` equality;
2. identical Grand/Tichu, exchange, play, wish and Dragon-recipient decisions where applicable.

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

The evaluator must be deterministic. Equal scores use stable tie-breaks based on normalized card IDs / stable option order, never `Math.random()`.

### 4.1 Estimated exits

The exit estimator is heuristic, not a full solver. It should prefer decompositions that remove many cards while preserving bombs/control.

For v1 it may use a bounded greedy/dynamic scoring pass over legal combinations rather than exhaustive search. The implementation must remain fast enough for browser play and server bot settling.

Performance quality gate for the strategy layer on CI-class Node hardware:

- typical 14-card `choosePlay` decisions should remain comfortably below 100 ms;
- no deterministic fixture/benchmark decision should exceed 250 ms without a documented optimization follow-up.

The benchmark records strategy decision timing so regressions are visible.

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
- do not obviously strengthen a dangerous opponent based only on public information.

### 6.2 Partner support

The partner card is selected separately from opponent cards.

If the partner has declared Tichu/Grand Tichu, the bot significantly increases the value of sending a strong control/support card when doing so does not catastrophically damage its own hand.

Special cards receive explicit heuristics:

- Dog can be highly valuable when partner support / lead transfer matters.
- Mah Jong has strategic lead/wish value and is not treated as merely rank 1.
- Phoenix is a flexible structure/control card and is expensive to give away.
- Dragon is maximum single-card control but may be worth supporting a declared partner in strong cases.

No exchange decision may depend on the exact hidden hands or exchange selections of other seats.

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
- preserve Dragon/Phoenix/Aces unless control is needed;
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

### 7.3 Bomb management

Bombs are valuable control assets, not forbidden moves.

When the bot is the acting seat, `strategic` may spend a legal bomb for a large positive reason, especially:

- the bomb immediately empties the bot's hand;
- it stops an opponent Tichu/Grand Tichu attempt;
- it prevents an opponent double victory;
- it protects the bot's team from an imminent finish;
- it captures or controls a high-value trick when the tactical gain clearly exceeds the preservation cost.

Otherwise bombs receive a strong preservation penalty.

**Bot-initiated out-of-turn bomb interrupts are explicitly not part of v1.** Humans may still use the game's existing out-of-turn bomb rule. Adding autonomous bot interrupts requires separate timing/arbitration design so a synchronous server bot does not unfairly pre-empt a human reaction window. This is a Bot AI v2 candidate.

## 8. Mah Jong wish

Wish selection may use only legal knowledge:

- bot's own remaining hand;
- IDs/ranks of cards the bot itself sent away in exchange;
- public played/discarded history;
- public declarations and hand counts.

The scorer prefers ranks that are strategically inconvenient for opponents based on known/public information while avoiding wishes the bot itself is likely to be forced to satisfy at a damaging moment.

The algorithm must not infer from exact authoritative opponent hands or other players' exchange maps.

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

Canonical fixture schema is defined in the client repo. The server repo receives a verbatim fixture copy with the same `fixtureVersion` and content hash recorded in its test. A fixture update is incomplete until both repos use the same version/hash.

Each fixture contains:

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
11. spend a bomb to stop an opponent Tichu when it is the bot's legal turn to answer;
12. spend a bomb to go out;
13. choose a wish from legal known information;
14. choose the safer Dragon recipient;
15. same visible information + permuted hidden hands => identical view and decision.

Client and server tests normalize result ordering before comparison.

## 11. Benchmark harness

### 11.1 Head-to-head design

The simulator gains per-seat/per-team policy selection.

For every benchmark seed, play a paired comparison:

- Match A: Team 0 `strategic`, Team 1 `baseline`.
- Match B: same seed, Team 0 `baseline`, Team 1 `strategic`.

Because bot decisions do not consume RNG, corresponding rounds use the same seeded shuffle sequence while both matches continue to that round. The team swap balances which seat-pair receives a particular deal.

A full developer benchmark uses **200 seed pairs / 400 matches**.

CI uses **10 seed pairs / 20 matches** for legality, determinism, reporting and runtime. CI does not fail merely because this small statistical sample has a losing strategic win rate.

### 11.2 Development and validation seed ranges

To reduce tuning to a single known range:

- iterative development/diagnostics may use seed pairs beginning at `1`;
- the first acceptance benchmark uses a separate 200-pair validation range beginning at `10001`;
- if strategy is changed after inspecting a failed acceptance range, the next acceptance run moves to the next predefined block (for example `20001`, then `30001`) rather than repeatedly tuning against the same 200 pairs.

The report always records base seed, pair count, engine version and git SHA.

### 11.3 Metrics

Collect at least:

- individual match wins by policy across the 400 matches;
- per-seed-pair aggregate score differential;
- average strategic-minus-baseline final score differential per match;
- rounds won / double victories;
- normal Tichu calls, successes and failures;
- Grand Tichu calls, successes and failures;
- net declaration points by policy and per match;
- average finish position by policy;
- bomb opportunities/uses where measurable without hidden-information leakage;
- average rounds and action count per match;
- strategy decision timing;
- invalid/rejected strategy decisions (must remain zero).

Output human-readable text plus machine-readable JSON under a gitignored artifact directory such as `artifacts/bot-benchmarks/`.

### 11.4 Success gate

Bot AI v1 is accepted only if:

1. all game invariants and existing regression tests remain green;
2. all client/server parity fixtures pass with matching fixture version/hash;
3. no-cheat hidden-hand permutation tests pass;
4. across the 400 validation matches, `strategic` wins more matches than `baseline` (ties are reported separately and do not count for either side);
5. average `strategic - baseline` final score differential is positive;
6. aggregate score differential across seed pairs is positive;
7. invalid/rejected strategy decisions remain zero;
8. declaration quality does not regress materially: net declaration points per match may not trail baseline by more than 5 points/match; normal/Grand success percentages are reported separately, and percentages based on fewer than 20 calls are marked inconclusive rather than used as a hard gate;
9. strategy decision timing meets the performance guardrails from section 4.1.

Do not tune acceptance thresholds to a particular result. If the validation benchmark fails, inspect category metrics, change heuristics, then use the next predefined validation seed block.

## 12. Tests and TDD

Implementation is test-first.

Client tests:

- pure strategy unit tests;
- fixture tests;
- `buildBotView` information-boundary tests;
- hidden-hand permutation tests;
- deterministic tie-break tests;
- baseline behavior lock tests;
- simulator mixed-policy tests;
- benchmark report/seed-swap tests;
- decision timing smoke.

Server tests:

- equivalent strategy scenarios in TypeScript;
- exact fixture version/hash contract;
- `BotView` boundary and no-hidden-hand dependency;
- integration through `settleTichuBots`;
- bot takeover continues to use strategic policy legally.

Existing deterministic full-match invariants and multiplayer E2E remain mandatory regression gates.

## 13. Integration sequence

1. Freeze/extract the client baseline policy without changing behavior.
2. Build client `BotView` and no-cheat tests.
3. Implement strategic hand analysis and declaration scoring in the client.
4. Implement strategic exchange and play scoring in the client.
5. Add benchmark harness and validate strategic vs baseline.
6. Port the same strategy contract and exact fixture version/hash to `qqnd-game-server`.
7. Run server typecheck/unit/build and client full suite.
8. Open/review the server PR; do not deploy unmerged code.
9. Merge/deploy the server only after explicit approval and green CI.
10. Run production multiplayer smoke against `api.qqnd.fyi` to verify authoritative strategic bots and takeover.
11. Switch local/server defaults to `strategic` only after all acceptance gates are met.
12. Rebase/retarget the stacked client branch after PR #9 lands, then open the Bot AI client PR.

## 14. README / developer UX

README documents the Bot AI direction immediately and must be updated again as commands become real during implementation.

Final implementation documentation must include:

- `baseline` vs `strategic` profiles;
- no-hidden-hand-cheating rule;
- actual local simulation/benchmark commands;
- benchmark seed/pair options;
- where benchmark artifacts are written;
- that authoritative online bots live in `qqnd-game-server` and require server deployment;
- that the 200-pair validation benchmark is a developer/manual quality gate, while CI uses a 10-pair smoke.

Documentation must not claim an unimplemented command or strategic default is already available.

## 15. Out of scope for v1

- Monte Carlo / determinization rollouts;
- neural models / external LLM calls;
- online self-learning or persistent player modeling;
- autonomous bot bomb interrupts outside the bot's scheduled turn;
- difficulty levels beyond selecting policy/threshold presets;
- use of hidden authoritative opponent hands for stronger play;
- perfect-information solving;
- changing Tichu game rules.

These are candidates for Bot AI v2+ after v1 metrics establish a stable baseline.