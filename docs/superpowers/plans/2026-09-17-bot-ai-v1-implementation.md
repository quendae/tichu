# Tichu Bot AI v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current simple Tichu bot policy with a deterministic, team-aware `strategic` heuristic policy, prove it beats the frozen `baseline` in paired deterministic benchmarks, and deploy the same policy to authoritative multiplayer bots without hidden-hand cheating.

**Architecture:** Extract bot decisions from the game engines into pure strategy modules fed only by a normalized `BotView`. The game/rules engine computes legal play options and passes them as `BotView.legalPlays`; the strategy never imports the authoritative engine just to discover legality, avoiding a server import cycle and strengthening the information boundary. Keep `baseline` and `strategic` profiles side by side, let the client simulator assign a policy per seat, and validate strategy quality with paired seeded matches. Port the same contract and canonical fixture corpus to `qqnd-game-server`. The client released default stays `baseline` until the server strategic release has passed production smoke; the server release candidate switches to `strategic` only after the client acceptance benchmark, fixture parity and server CI are green and the user approves deployment.

**Tech Stack:** Browser ES modules, Node.js 22 test runner, Playwright, deterministic seeded simulator; server TypeScript 7, Node.js >=24, `tsx --test`, Fastify/WebSocket runtime.

**Spec:** `docs/superpowers/specs/2026-09-17-bot-ai-v1-design.md`

## Global Constraints

- Bot AI v1 is deterministic: identical normalized `BotView` must produce identical output; no `Math.random()` inside strategy decisions.
- Strategy never receives exact opponent/partner hands or unrelated exchange selections.
- `BotView.legalPlays` is derived by the existing rules engine from the bot's own hand plus public trick/wish state; strategy scores those options but does not recreate authoritative legality.
- Client and server remain separate implementations but consume equivalent fixture content with matching fixture version/hash.
- Autonomous bot bomb interrupts outside the bot's scheduled turn are out of scope for v1.
- Typical 14-card `choosePlay` decisions should remain comfortably below 100 ms on CI-class Node hardware; no deterministic fixture/benchmark decision may exceed 250 ms without a documented optimization follow-up.
- CI benchmark smoke uses 10 seed pairs / 20 matches and is a correctness/runtime smoke only.
- Acceptance quality gate uses 200 seed pairs / 400 matches, initially from base seed `10001`; after tuning against a failed validation block, move to the next predefined block (`20001`, `30001`, ...).
- Acceptance requires more strategic match wins than baseline wins, positive average strategic-minus-baseline final score differential, positive aggregate paired score differential, zero rejected strategy decisions, and declaration net points no worse than baseline by more than 5 points/match.
- Do not merge or deploy either Bot AI PR without explicit user approval.
- Client branch: `feature/bot-ai-v1`, stacked on the current multiplayer E2E work until PR #9 lands.
- Server implementation branch: `feature/tichu-bot-ai-v1` from `qqnd-game-server/main`.

---

## File Structure

### Client (`quendae/tichu`)

- Create `src/bot-strategy.js` — `BotView`, baseline/strategic policy functions, hand analysis and stable scoring/tie-breaks; no rules-engine import is required for play legality.
- Modify `src/game.js` — produce legal play options with existing `possibleSelections`, build sanitized BotViews, delegate bot decisions to the strategy module and maintain per-seat policy selection.
- Create `tests/bot-strategy.test.mjs` — unit scenarios, baseline locks, BotView boundary, no-cheat and timing tests.
- Create `tests/fixtures/bot-strategy-v1.json` — canonical parity scenarios and expected normalized decisions.
- Create `tests/bot-strategy-fixtures.test.mjs` — execute canonical fixtures against the client strategy and validate fixture metadata/hash.
- Modify `src/simulation/driver.js` — accept per-seat policies and expose round/match telemetry needed by benchmark aggregation.
- Create `src/simulation/bot-benchmark.js` — paired seed runner and metric aggregation.
- Create `tests/bot-benchmark.test.mjs` — seed swap, metric/report and smoke-gate tests.
- Create `scripts/benchmark-bots.mjs` — CLI for smoke/development/validation benchmarks and JSON/text artifacts.
- Modify `package.json` — real benchmark commands.
- Modify `.gitignore` — ignore `artifacts/bot-benchmarks/`.
- Modify `.github/workflows/ci.yml` — add the 10-pair benchmark smoke after deterministic simulation.
- Modify `README.md` — replace planned commands with actual commands and document acceptance/deployment workflow.

### Server (`quendae/qqnd-game-server`)

- Create `src/games/tichu/bot-strategy.ts` — TypeScript equivalent of client strategy contract/scoring; no runtime import from `engine.ts`.
- Modify `src/games/tichu/engine.ts` — compute legal options with the existing internal `possibleSelections`, build sanitized BotViews, and delegate `settleTichuBots` decisions through the policy module.
- Create `test/fixtures/tichu-bot-strategy-v1.json` — verbatim copy of canonical client fixture.
- Create `test/tichu-bot-strategy.test.ts` — fixtures, fixture hash/version, hidden-hand independence, strategic integration and timing.
- Modify `test/tichu-engine.test.ts` — regression for strategic settling/takeover legality where engine integration is the relevant boundary.
- Modify `README.md` only if the existing deployment/bot documentation needs the new authoritative policy/default described.

---

### Task 1: Freeze Client Baseline and Introduce `BotView`

**Files:**
- Create: `src/bot-strategy.js`
- Modify: `src/game.js`
- Create: `tests/bot-strategy.test.mjs`

**Interfaces:**
- Produces `BOT_POLICY_BASELINE = 'baseline'`, `BOT_POLICY_STRATEGIC = 'strategic'`.
- Produces `buildBotView(state, seat, legalPlays = [])` returning only own hand, public state, legally known exchange cards and legal options already derived by the rules engine.
- Produces profile-aware `decideGrand(view, profile)`, `decideTichu(view, profile)`, `chooseExchange(view, profile)`, `choosePlay(view, profile)`, `chooseWish(view, selectedCards, profile)`, `chooseDragonRecipient(view, profile)`.
- `TichuGame` gains per-seat `botPolicies`; default remains `baseline` through Task 8.

- [ ] **Step 1: Write baseline-lock and information-boundary tests**

Add tests that reconstruct representative current behavior and prove `buildBotView` cannot expose hidden cards:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {TichuGame} from '../src/game.js';
import {
  BOT_POLICY_BASELINE, buildBotView, decideGrand, chooseExchange, choosePlay,
} from '../src/bot-strategy.js';

test('baseline Grand keeps the legacy four-high-card threshold',()=>{
  const game=new TichuGame({autoSchedule:false});
  game.state.phase='grand';
  game.state.hands[1]=[
    {id:'jade-12',suit:'jade',rank:12,special:null},
    {id:'sword-12',suit:'sword',rank:12,special:null},
    {id:'pagoda-13',suit:'pagoda',rank:13,special:null},
    {id:'star-14',suit:'star',rank:14,special:null},
    {id:'jade-2',suit:'jade',rank:2,special:null},
  ];
  assert.equal(decideGrand(buildBotView(game.state,1),BOT_POLICY_BASELINE),true);
});

test('BotView exposes counts but never exact opponent cards',()=>{
  const game=new TichuGame({autoSchedule:false});
  game.resetMatch();
  const view=buildBotView(game.state,1,[]);
  assert.deepEqual(view.hand,game.state.hands[1]);
  assert.deepEqual(view.handCounts,game.state.hands.map(hand=>hand.length));
  assert.equal(JSON.stringify(view).includes(game.state.hands[0][0].id),false);
  assert.equal('hands' in view,false);
});
```

Also lock the current exchange mapping and cheapest-non-bomb play behavior with hand-crafted states rather than random deals.

- [ ] **Step 2: Run the targeted tests and verify RED**

```bash
node --test tests/bot-strategy.test.mjs
```

Expected: FAIL because `src/bot-strategy.js` / exported policy functions do not exist.

- [ ] **Step 3: Implement the pure baseline module and sanitized view builder**

Start `src/bot-strategy.js` with a rules-independent contract:

```js
export const BOT_POLICY_BASELINE='baseline';
export const BOT_POLICY_STRATEGIC='strategic';
export const DEFAULT_BOT_POLICY=BOT_POLICY_BASELINE;

export function buildBotView(state,seat,legalPlays=[]){
  const ownPass=state.passSelections?.[seat]||{};
  const exchangeResolved=state.phase!=='exchange'&&Object.keys(state.passSelections||{}).length>0;
  const received=exchangeResolved
    ? Object.entries(state.passSelections||{})
        .filter(([from])=>Number(from)!==seat)
        .map(([,map])=>map?.[seat])
        .filter(Boolean)
    : [];
  return {
    seat,
    partner:(seat+2)%4,
    phase:state.phase,
    round:state.round,
    hand:structuredClone(state.hands[seat]),
    handCounts:state.hands.map(hand=>hand.length),
    table:structuredClone(state.table),
    lastPlay:structuredClone(state.lastPlay),
    legalPlays:structuredClone(legalPlays),
    declarations:[...state.declarations],
    scores:[...state.scores],
    finished:[...state.finished],
    wish:state.wish,
    discarded:structuredClone(state.discarded||[]),
    currentPlayer:state.currentPlayer,
    trickLeader:state.trickLeader,
    exchangeKnown:{sent:Object.values(ownPass),received},
  };
}
```

Implement `baseline` branches by moving the existing formulas out of `TichuGame` without changing their outputs. `choosePlay` consumes `view.legalPlays` in its existing stable order.

- [ ] **Step 4: Delegate `TichuGame` bot methods without changing behavior**

Keep compatibility wrappers such as `botWantsGrand`, `botExchangeMap`, `botPlayChoice`, `botShouldTichu` and `botWish`, but make them call the strategy module using `this.botPolicies[seat]`. For a play decision, `game.js` computes:

```js
let legalPlays=possibleSelections(this.state.hands[seat],this.state.lastPlay,this.state.wish);
if(this.state.wish&&legalPlays.some(option=>option.fulfills))legalPlays=legalPlays.filter(option=>option.fulfills);
const view=buildBotView(this.state,seat,legalPlays);
```

Add constructor/reset support for a four-entry policy array and normalize missing entries to `DEFAULT_BOT_POLICY`.

- [ ] **Step 5: Verify baseline parity**

```bash
node --test tests/bot-strategy.test.mjs tests/game.test.mjs tests/simulation-driver.test.mjs
npm test
npm run test:sim
```

Expected: all existing tests and deterministic simulation pass with the default still `baseline`.

- [ ] **Step 6: Commit**

```bash
git add src/bot-strategy.js src/game.js tests/bot-strategy.test.mjs
git commit -m "refactor: extract Tichu baseline bot policy"
```

---

### Task 2: Strategic Hand Analysis and Declaration Scoring

**Files:**
- Modify: `src/bot-strategy.js`
- Modify: `tests/bot-strategy.test.mjs`

**Interfaces:**
- Produces `analyzeHand(hand)` with stable numeric features including `estimatedExits`, `bombCount`, `controlScore`, `problemSingletons`, `structureScore`, `pointsAtRisk`.
- `decideGrand(view, 'strategic')` and `decideTichu(view, 'strategic')` use deterministic score thresholds and bounded match-score adjustment.

- [ ] **Step 1: Add RED tests for strong/weak declaration cases and deterministic analysis**

Use explicit hands: a bomb + Dragon/Phoenix/Ace structure must score above a disconnected low-card hand; Grand threshold must be stricter than Tichu; changing only hidden opponent cards cannot change the result because they are absent from `BotView`.

```js
test('strategic Grand requires coherent control, not just four face cards',()=>{
  const weakView=fixtureView({hand:[card('jade',12),card('sword',12),card('pagoda',12),card('star',12),card('jade',2),card('sword',3),card('pagoda',4),card('star',5)]});
  assert.equal(decideGrand(weakView,'strategic'),false);
});
```

- [ ] **Step 2: Run targeted tests and verify RED**

```bash
node --test tests/bot-strategy.test.mjs
```

Expected: strategic analysis/declaration assertions fail while baseline locks remain green.

- [ ] **Step 3: Implement bounded hand analysis**

Detect useful structures directly from the bot's own card ranks/suits, score cards participating in those structures, and compute a greedy estimated-exit count. Do not import the game engine or exhaustively recurse through the full game tree. Stable tie-breaks use normalized card IDs.

- [ ] **Step 4: Implement declaration score constants**

Keep constants together in `STRATEGIC_WEIGHTS` so tests can reason about the policy. Match-score adjustment must be capped and smaller than the effect of a major hand-quality feature.

- [ ] **Step 5: Verify unit and timing guardrail**

Add a test measuring a fixed 14-card fixture with `performance.now()` over repeated calls and assert no individual deterministic call exceeds 250 ms. Run:

```bash
node --test tests/bot-strategy.test.mjs
npm test
```

- [ ] **Step 6: Commit**

```bash
git add src/bot-strategy.js tests/bot-strategy.test.mjs
git commit -m "feat: score Tichu hands and declarations"
```

---

### Task 3: Strategic Exchange, Wish and Dragon Choices

**Files:**
- Modify: `src/bot-strategy.js`
- Modify: `tests/bot-strategy.test.mjs`

**Interfaces:**
- `chooseExchange(view, 'strategic') -> Record<number,string>` containing exactly one own card for each other seat.
- `chooseWish(view, selectedCards, 'strategic') -> integer 2..14`.
- `chooseDragonRecipient(view, 'strategic') -> legal opponent seat`.

- [ ] **Step 1: Write RED exchange tests**

Cover bomb preservation, straight/steps preservation, partner declared Tichu support, and stable tie-breaks. Assert all three selected IDs are unique and belong to `view.hand`.

- [ ] **Step 2: Write RED wish/Dragon tests**

Wish test must change only with own hand / own sent exchange cards / public cards. Dragon recipient test prefers the opponent with more cards and penalizes an opponent with active Tichu/Grand.

- [ ] **Step 3: Verify RED**

```bash
node --test tests/bot-strategy.test.mjs
```

- [ ] **Step 4: Implement marginal exchange scoring**

For each candidate card calculate `analyzeHand(hand without card)` and combine hand-structure loss, control-card cost, target relationship and partner declaration state. Select partner card first, then opponent cards from remaining candidates with stable deterministic tie-breaks.

- [ ] **Step 5: Implement known-information wish and Dragon scoring**

Wish must not inspect any field outside `BotView`; Dragon scoring uses only `handCounts`, declarations, finish order and a small score-context tie-break.

- [ ] **Step 6: Run regression suite and commit**

```bash
node --test tests/bot-strategy.test.mjs
npm test
npm run test:sim

git add src/bot-strategy.js tests/bot-strategy.test.mjs
git commit -m "feat: add strategic Tichu exchange and special-card choices"
```

---

### Task 4: Team-Aware Strategic Play Scoring

**Files:**
- Modify: `src/bot-strategy.js`
- Modify: `tests/bot-strategy.test.mjs`
- Modify: `src/game.js`

**Interfaces:**
- `choosePlay(view, 'strategic') -> {type:'play',ids:string[],wishRank:number|null} | {type:'pass'}`.
- Strategy scores only `view.legalPlays`, already produced by `possibleSelections(view.hand, view.lastPlay, view.wish)` in `game.js`; `TichuGame.playCards/pass` remains the final legality authority.

- [ ] **Step 1: Write RED tactical tests**

Create deterministic states covering:

```text
partner winning safely -> pass / do not overtake
opponent at 1 card -> overtake when legal
opponent declared Tichu -> spend stronger control when needed
cheap legal response exists -> preserve Dragon/Phoenix
bomb is final hand -> play bomb
bomb would stop Tichu on bot's scheduled turn -> allow bomb
no urgent reason -> preserve bomb
leading -> prefer efficient multi-card shedding without breaking bomb
```

Also assert the policy never returns an out-of-turn interrupt decision; scheduled-turn strategy only.

- [ ] **Step 2: Verify RED**

```bash
node --test tests/bot-strategy.test.mjs
```

- [ ] **Step 3: Implement option scorer**

Score every entry in `view.legalPlays` with explicit components: cards shed, change in estimated exits, preservation cost, control-card spend, table point value, partner ownership, opponent hand-count threat, declarations and finish/double-victory pressure. Sort by score descending then stable normalized card-ID key.

- [ ] **Step 4: Integrate strategic wrappers in `TichuGame`**

`botPlayChoice` and bot Dragon handling call strategy using the configured seat policy. Keep `DEFAULT_BOT_POLICY='baseline'` until the post-deployment production smoke in Task 8 has passed.

- [ ] **Step 5: Run full client correctness suites**

```bash
npm test
npm run test:sim
npm run test:e2e
```

- [ ] **Step 6: Commit**

```bash
git add src/bot-strategy.js src/game.js tests/bot-strategy.test.mjs
git commit -m "feat: add team-aware Tichu play scoring"
```

---

### Task 5: Canonical Strategy Fixtures and No-Cheat Contract

**Files:**
- Create: `tests/fixtures/bot-strategy-v1.json`
- Create: `tests/bot-strategy-fixtures.test.mjs`
- Modify: `tests/bot-strategy.test.mjs`

**Interfaces:**
- Fixture root: `{ "fixtureVersion": 1, "scenarioHash": "<computed SHA-256>", "scenarios": [...] }`; `scenarioHash` is SHA-256 of `JSON.stringify(scenarios)` and is written by the exact command below, not hand-authored.
- Each scenario: `{id, decision, profile, view, expected}`.
- Normalized decisions sort object keys/ID arrays where ordering has no semantic meaning.

- [ ] **Step 1: Create the 15 required canonical scenarios**

Use the exact categories from spec section 10. Every fixture is a complete `BotView`; no raw authoritative `hands` collection is allowed. Start with `"scenarioHash": ""`; Step 5 computes it automatically before commit.

- [ ] **Step 2: Write the fixture runner test before wiring all scenarios**

```js
const decisionFns={
  grand:scenario=>decideGrand(scenario.view,scenario.profile),
  tichu:scenario=>decideTichu(scenario.view,scenario.profile),
  exchange:scenario=>chooseExchange(scenario.view,scenario.profile),
  play:scenario=>choosePlay(scenario.view,scenario.profile),
  wish:scenario=>chooseWish(scenario.view,scenario.selectedCards||[],scenario.profile),
  dragon:scenario=>chooseDragonRecipient(scenario.view,scenario.profile),
};
for(const scenario of fixtures.scenarios){
  test(`fixture: ${scenario.id}`,()=>{
    const actual=normalizeDecision(decisionFns[scenario.decision](scenario));
    assert.deepEqual(actual,scenario.expected);
  });
}
```

The test also recomputes SHA-256 of `fixtures.scenarios` and asserts it equals `fixtures.scenarioHash`.

- [ ] **Step 3: Add explicit hidden-state permutation test at the engine boundary**

Construct two full game states with identical bot hand/public fields but swap exact cards between the other three hands. Generate legal plays independently from the bot's own hand/public state for each source, build both BotViews, then assert deep equality and identical outputs for all applicable decision functions.

- [ ] **Step 4: Verify fixtures and full unit suite before hash finalization**

```bash
node --test tests/bot-strategy-fixtures.test.mjs tests/bot-strategy.test.mjs
```

Expected at this intermediate step: decision assertions pass; hash assertion fails while `scenarioHash` is empty.

- [ ] **Step 5: Compute and write canonical fixture digest automatically**

Run:

```bash
node --input-type=module -e "import fs from 'node:fs';import crypto from 'node:crypto';const p='tests/fixtures/bot-strategy-v1.json';const d=JSON.parse(fs.readFileSync(p,'utf8'));d.scenarioHash=crypto.createHash('sha256').update(JSON.stringify(d.scenarios)).digest('hex');fs.writeFileSync(p,JSON.stringify(d,null,2)+'\n');console.log(d.scenarioHash)"
```

Then rerun:

```bash
node --test tests/bot-strategy-fixtures.test.mjs tests/bot-strategy.test.mjs
npm test
```

Expected: hash and all scenarios pass.

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures/bot-strategy-v1.json tests/bot-strategy-fixtures.test.mjs tests/bot-strategy.test.mjs
git commit -m "test: define Tichu bot strategy parity fixtures"
```

---

### Task 6: Mixed-Policy Simulator and Baseline-vs-Strategic Benchmark

**Files:**
- Modify: `src/simulation/driver.js`
- Create: `src/simulation/bot-benchmark.js`
- Create: `tests/bot-benchmark.test.mjs`
- Create: `scripts/benchmark-bots.mjs`
- Modify: `package.json`
- Modify: `.gitignore`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- `runDeterministicMatch({... , botPolicies})` accepts exactly four profile names.
- `runBotBenchmark({pairs,baseSeed,validate,gitSha})` plays two matches per seed with team policies swapped.
- Benchmark result includes `matchWins`, `pairWins`, `averageScoreDifferential`, `aggregatePairDifferential`, declarations, doubles, finish position, action counts, rejected decisions and timing.

- [ ] **Step 1: Add RED mixed-policy simulator tests**

Assert the same seed can run `[strategic,baseline,strategic,baseline]` and swapped `[baseline,strategic,baseline,strategic]`, and that policy assignment is recorded in result metadata.

- [ ] **Step 2: Add RED benchmark aggregation tests**

Use a small injected/fake match runner to prove pair score orientation is correct when team policies swap. Define pair differential as the sum of each match's final strategic-team score minus baseline-team score. Pair win/loss/tie follows the sign of that sum.

- [ ] **Step 3: Modify driver and collect round telemetry**

Record round-end snapshots sufficient to count declarations, declaration success, double victory, finish order and action count without changing replay determinism.

- [ ] **Step 4: Implement paired benchmark runner and CLI**

CLI flags:

```text
--pairs <n>        default 50 for ad-hoc developer use
--seed <n>         default 1
--validate         enforce quality gates
--quiet            suppress per-pair progress
--git-sha <sha>    metadata
```

Add package scripts:

```json
"test:bot-benchmark": "node scripts/benchmark-bots.mjs --pairs 10 --seed 1 --quiet",
"bot:benchmark": "node scripts/benchmark-bots.mjs",
"bot:benchmark:validate": "node scripts/benchmark-bots.mjs --pairs 200 --seed 10001 --validate"
```

Write JSON and text reports under `artifacts/bot-benchmarks/`; add that path to `.gitignore`.

- [ ] **Step 5: Make smoke correctness-only and validation strict**

Without `--validate`, exit non-zero only on rejected/invalid decisions, invariant failure, malformed report or timing >250 ms. With `--validate`, additionally enforce all spec section 11.4 quality gates.

- [ ] **Step 6: Run RED/GREEN benchmark tests, then CI-size smoke**

```bash
node --test tests/bot-benchmark.test.mjs
npm run test:bot-benchmark
```

Expected: 20 full matches complete, report files are produced, zero rejected decisions, no timing >250 ms. The 10-pair sample's win rate is reported but not a quality failure.

- [ ] **Step 7: Add smoke to CI**

Add `npm run test:bot-benchmark` after `npm run test:sim`; do not put the 200-pair validation run into default CI.

- [ ] **Step 8: Run the full acceptance benchmark**

```bash
npm run bot:benchmark:validate
```

Expected on initial validation block `10001..10200`: all quality gates pass. If they fail and heuristics are changed after inspecting this range, rerun acceptance on the next untouched block by executing:

```bash
node scripts/benchmark-bots.mjs --pairs 200 --seed 20001 --validate
```

Continue to `30001`, etc. for subsequent tuned iterations; never claim acceptance from a range already used for tuning.

- [ ] **Step 9: Record acceptance but keep the released client default on baseline**

Store the accepted report metrics in execution notes/PR body. Strategic is now eligible for server parity/rollout, but `DEFAULT_BOT_POLICY` remains `baseline` until Task 8 production smoke succeeds.

- [ ] **Step 10: Commit benchmark changes**

```bash
git add src/simulation/driver.js src/simulation/bot-benchmark.js tests/bot-benchmark.test.mjs scripts/benchmark-bots.mjs package.json .gitignore .github/workflows/ci.yml
git commit -m "feat: benchmark strategic Tichu bots"
```

---

### Task 7: Port the Strategy Contract to `qqnd-game-server`

**Files:**
- Server branch: `feature/tichu-bot-ai-v1`
- Create: `src/games/tichu/bot-strategy.ts`
- Modify: `src/games/tichu/engine.ts`
- Create: `test/fixtures/tichu-bot-strategy-v1.json`
- Create: `test/tichu-bot-strategy.test.ts`
- Modify: `test/tichu-engine.test.ts`

**Interfaces:**
- Server exports the same policy names and normalized decision shapes as client.
- `buildBotView(state, seat, legalPlays)` lives in the strategy module but does not import `engine.ts` at runtime.
- `settleTichuBots(input, botSeats, maxSteps = 128, botPolicies = {})` accepts optional seat policies; until Task 8 final switch, unspecified seats remain `baseline`.

- [ ] **Step 1: Create server branch from current `main`**

```bash
git switch main
git pull --ff-only origin main
git switch -c feature/tichu-bot-ai-v1
```

- [ ] **Step 2: Copy the canonical fixture verbatim and verify digest before implementation**

Copy client `tests/fixtures/bot-strategy-v1.json` to server `test/fixtures/tichu-bot-strategy-v1.json`. Recompute SHA-256 of `scenarios` and assert it equals the copied `scenarioHash`; the entire JSON file should be byte-for-byte identical apart from path.

- [ ] **Step 3: Write RED server fixture/boundary tests**

Import the new strategy API from `../src/games/tichu/bot-strategy.js`; run every canonical fixture and add a full-state hidden-hand permutation test proving identical `buildBotView` and decision output. Server fixture tests recompute `scenarioHash` exactly as client tests do.

- [ ] **Step 4: Verify RED**

```bash
npx tsx --test test/tichu-bot-strategy.test.ts
```

Expected: FAIL because server strategy module does not exist.

- [ ] **Step 5: Implement TypeScript strategy with the same constants/ordering rules**

Port the client functions and weights directly rather than reinterpreting them. Define explicit `BotCard`, `BotPlayOption`, `BotView`, `BotPolicyName` and `BotDecision` structural types inside `bot-strategy.ts` (or type-only imports that erase at runtime). Do not runtime-import `engine.ts`, browser code, or a new shared package.

- [ ] **Step 6: Delegate server bot settling without an import cycle**

`engine.ts` keeps its existing `possibleSelections` implementation. Immediately before a bot play decision it computes/final-filters legal options using the authoritative hand/lastPlay/wish, then passes those options into `buildBotView(state,seat,legalPlays)`. Replace internal `botWantsGrand`, `botShouldTichu`, `botExchange`, `botWish` and `botAction` policy logic with wrappers around the strategy module. Reducer legality remains untouched.

- [ ] **Step 7: Add settle/takeover integration regressions**

In `test/tichu-engine.test.ts`, prove a strategic bot can progress Grand -> exchange -> play legally, and that `settleTichuBots` never mutates a human seat while it is waiting for that human.

- [ ] **Step 8: Verify full server baseline**

```bash
npm run typecheck
npm test
npm run build
```

- [ ] **Step 9: Commit and open server PR, but do not merge**

```bash
git add src/games/tichu/bot-strategy.ts src/games/tichu/engine.ts test/fixtures/tichu-bot-strategy-v1.json test/tichu-bot-strategy.test.ts test/tichu-engine.test.ts
git commit -m "feat: add strategic Tichu bot policy"
```

Open a PR to `qqnd-game-server/main` and require fresh PR CI green before Task 8.

---

### Task 8: Server Default Switch, Deployment and Production Verification

**Files:**
- Modify: `src/games/tichu/bot-strategy.ts` and/or `src/games/tichu/engine.ts` only where default selection is defined.
- Modify: server tests for default expectation.
- Client production tests already exist under `tests/e2e-multiplayer/`.

**Interfaces:**
- Unspecified authoritative server bot policy becomes `strategic` only after client acceptance benchmark and server parity CI are green.
- Client default remains `baseline` during this server rollout so local release behavior does not change before authoritative bots are proven in production.

- [ ] **Step 1: Switch server default from baseline to strategic with a failing-then-green default-policy test**

Add a server test that calls `settleTichuBots` without `botPolicies` and verifies a canonical state takes the strategic fixture decision rather than the baseline decision. Run it RED, switch the server default, then run it GREEN.

- [ ] **Step 2: Run full server verification on the exact PR HEAD**

```bash
npm run typecheck
npm test
npm run build
```

Require GitHub PR CI success on the same head SHA.

- [ ] **Step 3: Stop for explicit merge approval**

Report server PR URL, head SHA, fixture version/hash, typecheck/test/build status and client acceptance benchmark metrics. Do not merge until the user explicitly approves.

- [ ] **Step 4: After approval, merge and deploy**

On `/opt/qqnd-game-server`:

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
npm ci
npm run typecheck
npm test
npm run build
sudo systemctl restart qqnd-game-server
sudo systemctl --no-pager --full status qqnd-game-server
curl -fsS https://api.qqnd.fyi/api/v1/health
```

Expected: service active/running and health JSON `{ "ok": true, ... }`.

- [ ] **Step 5: Run production multiplayer smoke against deployed strategic bots**

From the client branch:

```bash
npm run test:e2e:multiplayer
npm run test:e2e:multiplayer:full
```

Expected: bounded 2H+2B/reconnect passes; 4H/takeover smoke passes, including substitute bot progress after grace.

---

### Task 9: Client Default, Documentation, Final Verification and PR Handoff

**Files:**
- Modify: `src/bot-strategy.js`
- Modify: `tests/bot-strategy.test.mjs`
- Modify: `README.md`
- Optionally modify: server `README.md` if authoritative bot docs are stale.

- [ ] **Step 1: After production server smoke, switch released client default to strategic**

First add/update the default-policy assertion so it fails while `DEFAULT_BOT_POLICY` is still `baseline`, then change:

```js
export const DEFAULT_BOT_POLICY=BOT_POLICY_STRATEGIC;
```

Run:

```bash
node --test tests/bot-strategy.test.mjs
npm test
npm run test:sim
```

Expected: default-policy assertion and regressions pass.

- [ ] **Step 2: Update README from future tense to actual commands/results**

Document:

```text
npm run test:bot-benchmark
npm run bot:benchmark -- --pairs 50 --seed 1
npm run bot:benchmark:validate
```

Describe baseline vs strategic, no-hidden-hand rule, artifact path, validation seed policy, authoritative server deployment requirement and the latest accepted validation report summary.

- [ ] **Step 3: Fresh client verification on final HEAD**

Run:

```bash
npm test
npm run test:sim
npm run test:bot-benchmark
npm run test:e2e
npm run test:e2e:multiplayer
```

Also reference the already-passed full 200-pair acceptance report and post-deployment `test:e2e:multiplayer:full` result; do not rerun the 400-match benchmark merely because the default constant/documentation changed. Rerun validation only if strategy weights, decisions, legal-option generation, game rules or simulator semantics changed after acceptance.

- [ ] **Step 4: Rebase/retarget stacked branch after PR #9 lands**

If PR #9 is already merged, rebase/fast-forward the Bot AI branch onto updated `main` without dropping Bot AI commits. If PR #9 is still open, keep Bot AI stacked and target its PR at `feature/multiplayer-e2e` until #9 lands; then retarget to `main` and require a new PR-triggered CI run.

- [ ] **Step 5: Inspect final diff for scope/safety**

Confirm no fixture contains hidden authoritative opponent hands beyond complete synthetic test `BotView`s, no benchmark artifacts are tracked, no session tokens enter diagnostics, no strategy runtime-imports the server engine, and default CI contains only the 10-pair benchmark smoke rather than the 200-pair validation job.

- [ ] **Step 6: Commit final client default/docs, open/update PR and stop before merge**

```bash
git add src/bot-strategy.js tests/bot-strategy.test.mjs README.md
git commit -m "docs: enable and document strategic Tichu bots"
```

PR body must include:

- accepted validation base seed and pair count;
- strategic vs baseline match wins;
- average score differential;
- aggregate paired differential;
- declaration net points/match comparison;
- max observed decision time;
- client/server fixture version and SHA-256;
- server deployed commit and production smoke results.

Require fresh PR CI green, then report PR URL/head SHA/status to the user. Do not merge without explicit approval.
