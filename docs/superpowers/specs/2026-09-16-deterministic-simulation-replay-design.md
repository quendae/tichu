# Deterministic Simulation and Replay Harness

Date: 2026-09-16
Status: proposed / approved in chat, pending written-spec review
Scope: `quendae/tichu`

## Goal

Add a deterministic, headless simulation subsystem that can run complete bot-vs-bot Tichu matches at high speed, assert game invariants after every transition, and produce compact developer replays that reproduce failures exactly.

The primary use case is finding rare rule/state bugs before multiplayer hardening and bot improvements. A failing simulation must be reproducible from a seed and replay file without depending on browser timing, UI state, or wall-clock delays.

## Non-goals

- Do not change normal gameplay rules as part of this feature unless a simulation exposes an existing bug.
- Do not expose hidden hands through the production UI or multiplayer client.
- Do not build a user-facing replay viewer yet.
- Do not make bot strategy substantially smarter in this phase.
- Do not replace current Playwright UI coverage.

## Architecture

### 1. Deterministic RNG injection

`TichuGame` currently calls shuffle logic that defaults to `Math.random()`. The game constructor will accept an optional RNG function. Normal application use keeps the current behavior by defaulting to `Math.random`; simulations pass a seeded PRNG.

All simulation-relevant randomness must flow through this injected RNG. The seed is stored in the replay header.

The RNG interface remains minimal:

```js
const rng = () => numberBetweenZeroInclusiveAndOneExclusive;
new TichuGame({ rng });
```

No global monkey-patching of `Math.random()` is allowed.

### 2. Simulation driver

Add a headless driver separate from UI code. It controls all four seats and advances the existing `TichuGame` methods synchronously instead of relying on bot timers.

The driver will:

1. start/reset a match;
2. resolve the Grand Tichu window for all four bot seats;
3. resolve exchange for all four bot seats;
4. repeatedly execute the current seat's bot action;
5. resolve Dragon recipient choices deterministically;
6. advance round-end to the next round;
7. stop at match-end or fail on an action/step budget.

The driver must use the existing game/rules APIs (`declareGrand`, `submitExchange`, `playCards`, `pass`, `collectTrick`, `nextRound`, etc.) rather than duplicating rules.

Timer-based bot scheduling must be bypassed in simulation mode. The production scheduling path remains unchanged.

### 3. Replay recorder

The replay format is developer-only JSON and may contain complete hidden information for all four seats.

Use a hybrid format: seed + action log + compact checkpoints, with a full failure snapshot when an invariant fails.

Proposed top-level schema:

```json
{
  "format": "tichu-dev-replay-v1",
  "createdAt": "2026-09-16T10:00:00.000Z",
  "seed": 738,
  "engineVersion": "git-or-package-version",
  "config": {
    "targetScore": 1000,
    "stepLimit": 10000
  },
  "initial": {
    "state": "full serialized initial state"
  },
  "actions": [
    {
      "step": 1,
      "round": 1,
      "seat": 0,
      "type": "declareGrand",
      "payload": { "yes": false },
      "summaryBefore": "compact summary/hash",
      "summaryAfter": "compact summary/hash"
    }
  ],
  "checkpoints": [
    {
      "step": 100,
      "state": "full serialized state"
    }
  ],
  "failure": null
}
```

On failure, `failure` includes:

- violated invariant identifier;
- human-readable message;
- step and round;
- action being applied;
- full state immediately before and after when available;
- recent action window;
- seed.

Replay serialization must normalize non-JSON state such as `Set` values (`selected`) into arrays.

### 4. Replay runner

Add a CLI entry point that loads a developer replay and reproduces it using the same seeded RNG and action sequence.

Target command:

```bash
npm run replay -- artifacts/replays/failure-seed-738.json
```

The runner validates:

- replay format version;
- seed;
- action sequence legality;
- deterministic state summaries/checkpoints;
- expected failure point, when present.

On divergence it exits non-zero and reports the first differing step.

### 5. Invariant checker

Invariant checks run after every meaningful game transition in simulation mode.

Initial invariant set:

#### Card conservation and uniqueness

- Every card ID appears in at most one live location.
- During a complete round, cards are accounted for across hands, table, captured piles, and undealt `remainingDeck` where applicable.
- The total set of card IDs is the expected 56-card Tichu deck.
- No hand contains duplicate card IDs.

#### Turn/state coherence

- `currentPlayer`, `trickLeader`, finished seats, and phase are valid seat/phase values.
- A finished player is not selected as the current active player unless the round is already ending.
- `passes` is never negative and does not exceed the number of active players required to collect a trick.
- `lastPlay === null` is consistent with an empty/reset trick state.

#### Exchange coherence

- Each completed exchange selects exactly three distinct owned cards.
- Each target receives exactly one card from every other player.
- After exchange resolution, each player has 14 cards before play begins.

#### Wish / special-card coherence

- If a wish exists and the current player can legally fulfill it, passing is not accepted.
- Dog is only played as a single lead.
- Dragon collection always goes to an opposing team.
- Mah Jong wish values remain in the legal 2-14 range when set.
- Phoenix never becomes a bomb card through state corruption.

#### Finish / scoring coherence

- `finished` contains unique seats only.
- Going out removes the last card from that seat's hand.
- Double victory only applies when the first two finishers are teammates.
- Round scores are finite numbers.
- Match scores equal accumulated round deltas produced by the engine.
- `match-end` has a non-null winner and a non-tied score at/above the target threshold.

#### Progress / deadlock protection

- A configurable maximum number of transitions is enforced per round and per match.
- Repeated identical state summaries beyond a small threshold are treated as a potential deadlock.

### 6. State summaries

For fast comparison, each transition stores a deterministic compact state summary derived from stable game fields rather than object identity or log timestamps.

The summary includes at minimum:

- phase and round;
- current player and trick leader;
- ordered hand card IDs for each seat;
- table entries and card IDs;
- captured card IDs;
- finished order;
- wish;
- declarations;
- exchange completion state;
- scores and round score;
- Dragon/pending-round-end state.

Wall-clock log timestamps and random UUIDs are excluded from deterministic comparison.

### 7. CLI simulation runner

Add commands with practical defaults:

```bash
npm run sim
npm run sim -- --matches 1000 --seed 1
npm run sim -- --matches 10000 --seed 50000 --out artifacts/replays
```

Behavior:

- sequential deterministic seeds by default (`baseSeed + index`);
- concise progress and aggregate results;
- stop immediately on first invariant failure by default;
- write a replay JSON automatically on failure;
- non-zero exit code on failure;
- optional `--continue-on-failure` can be deferred until needed.

## Test strategy

### Unit tests

Add focused tests for:

- seeded PRNG repeatability;
- injected RNG producing identical deals for identical seeds;
- replay state serialization/deserialization;
- invariant checker detecting intentionally malformed states;
- replay reproducing a deterministic short scenario;
- state summaries ignoring timestamps/UUID noise.

### Simulation regression test

Normal CI runs a bounded deterministic sample, initially 100 complete matches. This should remain fast enough for every PR.

A separate manually-invoked or scheduled command supports 1,000-10,000+ matches without making every PR slow.

Any seed that exposes a real engine bug should be added as a permanent targeted regression test after the bug is fixed.

### Existing tests

Current unit tests and Playwright suites remain required and must stay green. The simulation harness must not alter compact/desktop UI behavior.

## Failure handling

Simulation failures are developer diagnostics, not swallowed errors. A failure should report:

```text
Invariant failed: CARD_CONSERVATION
seed=738 match=12 round=3 step=126
lastAction=playCards seat=2 cards=[...]
replay=artifacts/replays/failure-seed-738.json
```

The replay file must be written before the process exits whenever filesystem access is available.

If replay writing itself fails, the original invariant error remains the primary error and the write failure is reported secondarily.

## Privacy and security boundary

Developer replay files intentionally contain all hidden hands and therefore must never be emitted by the normal browser UI or multiplayer transport.

`artifacts/replays/` should be ignored by Git by default so accidental failure files do not get committed. Curated regression fixtures, if needed, belong in a separate explicit test-fixture directory and are reviewed before commit.

## Expected repository changes

Likely files/modules:

- `src/game.js` — optional injected RNG and a small simulation-safe scheduling seam;
- `src/simulation/rng.js` — seeded PRNG;
- `src/simulation/invariants.js` — invariant checks;
- `src/simulation/replay.js` — normalization, summaries, recorder/replay helpers;
- `src/simulation/driver.js` — synchronous match driver;
- `scripts/simulate.mjs` — CLI batch runner;
- `scripts/replay.mjs` — replay CLI;
- `tests/simulation.test.mjs` and focused related tests;
- `package.json` — `sim` and `replay` scripts;
- `.gitignore` — generated replay artifacts.

Exact file boundaries may be adjusted during implementation if the existing code suggests a cleaner split, but rules must remain centralized in the current game/rules engine.

## Acceptance criteria

1. Two simulations with the same seed produce the same initial deal and same deterministic action/state-summary sequence.
2. Different seeds produce independently shuffled games.
3. A headless full match reaches `match-end` without timers or browser APIs.
4. Invariants are checked after every simulation transition.
5. A deliberate invariant violation creates a useful failure record.
6. A saved failure replay can be reproduced by the replay CLI to the same step.
7. Generated failure replay artifacts are not committed by default.
8. Standard CI includes a bounded deterministic multi-match smoke/regression run.
9. Existing unit and Playwright suites remain green.
10. Production UI and multiplayer do not expose developer hidden-state replay data.
