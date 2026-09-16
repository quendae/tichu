# Deterministic Simulation and Replay Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic headless Tichu simulation harness that can run complete bot-vs-bot matches, assert invariants after every transition, and reproduce failures from developer replay JSON files.

**Architecture:** Keep `TichuGame` as the only game/rules authority. Add two narrow seams to it—injectable RNG and optional automatic bot scheduling—plus pure bot-decision helpers reused by both production timers and simulation. New `src/simulation/*` modules provide seeded RNG, JSON-safe replay/state summaries, invariant checks, and a synchronous driver; Node scripts provide batch simulation and replay CLI without exposing hidden developer state to browser UI or multiplayer.

**Tech Stack:** Node.js 22, ES modules, built-in `node:test`, existing Tichu game/rules engine, GitHub Actions, Playwright unchanged.

**Spec:** `docs/superpowers/specs/2026-09-16-deterministic-simulation-replay-design.md`

## Global Constraints

- Normal application behavior must continue to default to `Math.random()` and timer-driven bot scheduling.
- No global monkey-patching of `Math.random()`.
- `autoSchedule=false` may disable timers only; it must not change game rules, scoring, bot strategy, or UI-visible state.
- Simulation must call the existing `TichuGame`/rules APIs rather than implementing a second rules engine.
- Developer replays may contain all four hidden hands but must never be exposed by the production browser UI or multiplayer transport.
- Generated failure replays live under `artifacts/replays/` and are ignored by Git.
- Replay format is exactly `tichu-dev-replay-v1` for this implementation.
- Replay `engineVersion` is the package version (`0.2.0` until package version changes); optional `gitSha` is metadata only and must not participate in deterministic comparison.
- CI runs a bounded deterministic sample of 100 complete matches; larger 1,000–10,000+ runs remain manual/local.
- Existing unit tests and Playwright suites must remain green.

---

## File Map

- Modify `src/game.js` — inject RNG, gate scheduling, expose pure bot decision helpers while preserving existing bot behavior.
- Create `src/simulation/rng.js` — deterministic seeded PRNG.
- Create `src/simulation/replay.js` — JSON-safe state normalization, deterministic state projection/summary, replay document helpers and validation.
- Create `src/simulation/invariants.js` — invariant error type and state checks.
- Create `src/simulation/driver.js` — synchronous action selection/application, full-match runner, batch runner, replay executor.
- Create `scripts/simulate.mjs` — CLI for batch simulations and failure replay writing.
- Create `scripts/replay.mjs` — CLI for replay validation/reproduction.
- Modify `package.json` — add `sim`, `replay`, and `test:sim` scripts.
- Modify `.gitignore` — ignore `artifacts/replays/`.
- Modify `.github/workflows/ci.yml` — run deterministic 100-match simulation before Playwright.
- Modify `README.md` — document simulation/replay developer commands.
- Create `tests/simulation-rng.test.mjs`, `tests/simulation-replay.test.mjs`, `tests/simulation-invariants.test.mjs`, `tests/simulation-driver.test.mjs`.
- Modify `tests/game.test.mjs` only if a targeted compatibility assertion is needed for production scheduling/bot decisions.

---

### Task 1: Seeded RNG and simulation-safe scheduling seam

**Files:**
- Create: `src/simulation/rng.js`
- Modify: `src/game.js`
- Test: `tests/simulation-rng.test.mjs`

**Interfaces:**
- Produces: `createSeededRng(seed: number|string): () => number`
- Changes: `new TichuGame({ botDelay=500, rng=Math.random, autoSchedule=true }={})`
- Guarantees: `startRound()` shuffles through `this.rng`; `scheduleBots()` immediately returns after clearing any existing timer when `autoSchedule === false`.

- [ ] **Step 1: Write failing repeatability and injected-deal tests**

Create `tests/simulation-rng.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { TichuGame } from '../src/game.js';
import { createSeededRng } from '../src/simulation/rng.js';

const handIds = game => game.state.hands.map(hand => hand.map(card => card.id));

test('seeded RNG repeats the same number stream', () => {
  const a = createSeededRng(738);
  const b = createSeededRng(738);
  assert.deepEqual(
    Array.from({length: 8}, () => a()),
    Array.from({length: 8}, () => b()),
  );
});

test('same seed produces the same first eight-card deal', () => {
  const a = new TichuGame({ rng: createSeededRng(738), autoSchedule: false });
  const b = new TichuGame({ rng: createSeededRng(738), autoSchedule: false });
  a.resetMatch({ names:['A','B','C','D'], botSeats:[0,1,2,3] });
  b.resetMatch({ names:['A','B','C','D'], botSeats:[0,1,2,3] });
  assert.deepEqual(handIds(a), handIds(b));
  assert.deepEqual(a.state.remainingDeck.map(card => card.id), b.state.remainingDeck.map(card => card.id));
  assert.equal(a.botTimer, null);
  assert.equal(b.botTimer, null);
});

test('different seeds produce different deals', () => {
  const a = new TichuGame({ rng: createSeededRng(1), autoSchedule: false });
  const b = new TichuGame({ rng: createSeededRng(2), autoSchedule: false });
  a.resetMatch({ names:['A','B','C','D'], botSeats:[0,1,2,3] });
  b.resetMatch({ names:['A','B','C','D'], botSeats:[0,1,2,3] });
  assert.notDeepEqual(handIds(a), handIds(b));
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
node --test tests/simulation-rng.test.mjs
```

Expected: FAIL because `src/simulation/rng.js` does not exist and `TichuGame` does not yet accept `rng`/`autoSchedule`.

- [ ] **Step 3: Implement deterministic PRNG**

Create `src/simulation/rng.js`:

```js
function seedToUint32(seed){
  if(typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  const text=String(seed);
  let hash=2166136261;
  for(let i=0;i<text.length;i++) hash=Math.imul(hash^text.charCodeAt(i),16777619);
  return hash>>>0;
}

export function createSeededRng(seed){
  let state=seedToUint32(seed);
  return () => {
    state=(state+0x6D2B79F5)>>>0;
    let t=state;
    t=Math.imul(t^(t>>>15),t|1);
    t^=t+Math.imul(t^(t>>>7),t|61);
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}
```

- [ ] **Step 4: Modify `TichuGame` constructor/shuffle/scheduling minimally**

In `src/game.js`, preserve `shuffle(cards, rng)` and change constructor/start round/scheduler semantics to:

```js
constructor({botDelay=500,rng=Math.random,autoSchedule=true}={}){
  super();
  this.botDelay=botDelay;
  this.rng=rng;
  this.autoSchedule=autoSchedule;
  this.playerConfig={names:['You',...BOT_NAMES],botSeats:[1,2,3]};
  this.state=this.newState();
  this.botTimer=null;
}
```

Use:

```js
const deck=shuffle(makeDeck(),this.rng);
```

and start `scheduleBots()` with:

```js
scheduleBots(){
  clearTimeout(this.botTimer);
  this.botTimer=null;
  if(!this.autoSchedule)return;
  // existing scheduling body unchanged
}
```

- [ ] **Step 5: Run focused and existing game tests**

Run:

```bash
node --test tests/simulation-rng.test.mjs tests/game.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game.js src/simulation/rng.js tests/simulation-rng.test.mjs
git commit -m "feat: add deterministic game RNG seam"
```

---

### Task 2: Extract reusable bot decisions without changing strategy

**Files:**
- Modify: `src/game.js`
- Test: `tests/game.test.mjs`

**Interfaces:**
- Produces: `game.botExchangeMap(seat): Record<number,string>`
- Produces: `game.botPlayChoice(seat): {type:'pass'} | {type:'play', ids:string[], wishRank:number|null}`
- Existing `botExchange(seat)` delegates to `botExchangeMap(seat)` then `submitExchange`.
- Existing `botTurn(seat)` keeps the same Tichu declaration behavior, delegates play selection to `botPlayChoice`, and then calls `pass` or `playCards`.

- [ ] **Step 1: Add failing tests for pure decisions and mutation wrappers**

Append to `tests/game.test.mjs`:

```js
import { createSeededRng } from '../src/simulation/rng.js';

test('bot exchange decision is pure and botExchange applies the same map', () => {
  const game=new TichuGame({rng:createSeededRng(11),autoSchedule:false});
  game.resetMatch({names:['A','B','C','D'],botSeats:[0,1,2,3]});
  for(let seat=0;seat<4;seat++) game.declareGrand(seat,false);
  const before=game.state.hands[0].map(card=>card.id);
  const map=game.botExchangeMap(0);
  assert.equal(new Set(Object.values(map)).size,3);
  assert.deepEqual(game.state.hands[0].map(card=>card.id),before);
  assert.equal(game.botExchange(0),true);
  assert.deepEqual(game.state.passSelections[0],map);
});

test('bot play decision is pure for the current player', () => {
  const game=new TichuGame({rng:createSeededRng(12),autoSchedule:false});
  game.resetMatch({names:['A','B','C','D'],botSeats:[0,1,2,3]});
  for(let seat=0;seat<4;seat++) game.declareGrand(seat,false);
  for(let seat=0;seat<4;seat++) game.botExchange(seat);
  const seat=game.state.currentPlayer;
  const before=game.state.hands[seat].map(card=>card.id);
  const choice=game.botPlayChoice(seat);
  assert.ok(choice && (choice.type==='pass'||choice.type==='play'));
  assert.deepEqual(game.state.hands[seat].map(card=>card.id),before);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
node --test tests/game.test.mjs
```

Expected: FAIL because `botExchangeMap` and `botPlayChoice` do not exist.

- [ ] **Step 3: Extract `botExchangeMap`**

Move only the map-building portion of current `botExchange` into:

```js
botExchangeMap(seat){
  const s=this.state;
  const hand=[...s.hands[seat]].sort((a,b)=>(a.rank||20)-(b.rank||20));
  const targets=[0,1,2,3].filter(x=>x!==seat);
  const partner=(seat+2)%4;
  const best=[...hand].sort((a,b)=>(b.rank||0)-(a.rank||0))[0];
  const lows=hand.filter(c=>c.id!==best?.id).slice(0,2);
  const map={};
  map[partner]=best?.id||hand[0].id;
  const enemies=targets.filter(t=>t!==partner);
  map[enemies[0]]=lows[0]?.id;
  map[enemies[1]]=lows[1]?.id;
  return map;
}

botExchange(seat){
  return this.submitExchange(seat,this.botExchangeMap(seat));
}
```

- [ ] **Step 4: Extract `botPlayChoice` and keep `botTurn` behavior equivalent**

Use the exact current selection order, wish handling, and non-bomb preference:

```js
botPlayChoice(seat){
  const s=this.state;
  if(s.currentPlayer!==seat||s.phase!=='play')return null;
  const opts=possibleSelections(s.hands[seat],s.lastPlay,s.wish);
  let legal=opts;
  if(s.wish&&opts.some(o=>o.fulfills))legal=opts.filter(o=>o.fulfills);
  let chosen=legal[0];
  if(!chosen)return {type:'pass'};
  const nonBomb=legal.find(o=>o.play.type!=='bomb');
  if(nonBomb)chosen=nonBomb;
  const wishRank=chosen.cards.some(c=>c.special==='mahjong')?this.botWish(seat,chosen.cards):null;
  return {type:'play',ids:chosen.cards.map(c=>c.id),wishRank};
}

botTurn(seat){
  const s=this.state;
  if(s.currentPlayer!==seat||s.phase!=='play')return false;
  if(s.hands[seat].length===14&&s.declarations[seat]==='none'&&this.botShouldTichu(seat))this.declareTichu(seat);
  const choice=this.botPlayChoice(seat);
  if(!choice)return false;
  if(choice.type==='pass')return this.pass(seat);
  const result=this.playCards(seat,choice.ids,choice.wishRank);
  if(this.state.dragonRecipient==='needed')this.collectTrick([0,1,2,3].find(x=>teamOf(x)!==teamOf(seat)));
  return result.ok;
}
```

- [ ] **Step 5: Run game/unit tests**

Run:

```bash
npm test
```

Expected: all unit tests PASS with no bot behavior regression.

- [ ] **Step 6: Commit**

```bash
git add src/game.js tests/game.test.mjs
git commit -m "refactor: expose deterministic bot decisions"
```

---

### Task 3: Replay normalization and deterministic summaries

**Files:**
- Create: `src/simulation/replay.js`
- Test: `tests/simulation-replay.test.mjs`

**Interfaces:**
- Produces: `REPLAY_FORMAT = 'tichu-dev-replay-v1'`
- Produces: `normalizeState(state): object`
- Produces: `deterministicState(state): object`
- Produces: `stateSummary(state): string` (8-character lowercase FNV-1a hex)
- Produces: `createReplay({seed,engineVersion,gitSha=null,config,initialState}): object`
- Produces: `recordReplayAction(replay,{step,round,seat,type,payload,beforeState,afterState}): object`
- Produces: `recordReplayCheckpoint(replay,step,state): void`
- Produces: `recordReplayFailure(replay,{code,message,step,round,action,beforeState,afterState}): void`
- Produces: `validateReplayDocument(replay): true` or throws `Error`.

- [ ] **Step 1: Write failing serialization/summary tests**

Create `tests/simulation-replay.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { TichuGame } from '../src/game.js';
import { createSeededRng } from '../src/simulation/rng.js';
import {
  REPLAY_FORMAT,normalizeState,stateSummary,createReplay,
  recordReplayAction,recordReplayCheckpoint,validateReplayDocument,
} from '../src/simulation/replay.js';

const makeGame=()=>{
  const game=new TichuGame({rng:createSeededRng(7),autoSchedule:false});
  game.resetMatch({names:['A','B','C','D'],botSeats:[0,1,2,3]});
  return game;
};

test('normalizeState converts Set and produces JSON-safe hidden state', () => {
  const game=makeGame();
  game.state.selected.add(game.state.hands[0][0].id);
  const normalized=normalizeState(game.state);
  assert.deepEqual(normalized.selected,[game.state.hands[0][0].id]);
  assert.doesNotThrow(()=>JSON.stringify(normalized));
  assert.equal(normalized.hands.length,4);
});

test('stateSummary ignores log UUID/time noise', () => {
  const game=makeGame();
  const first=stateSummary(game.state);
  game.state.log.unshift({id:'noise',text:'diagnostic only',time:999999});
  assert.equal(stateSummary(game.state),first);
});

test('replay helpers record deterministic before/after summaries and checkpoints', () => {
  const game=makeGame();
  const replay=createReplay({seed:7,engineVersion:'0.2.0',config:{targetScore:1000,stepLimit:10000},initialState:game.state});
  const before=normalizeState(game.state);
  game.declareGrand(0,false);
  recordReplayAction(replay,{step:1,round:1,seat:0,type:'declareGrand',payload:{yes:false},beforeState:before,afterState:game.state});
  recordReplayCheckpoint(replay,1,game.state);
  assert.equal(replay.format,REPLAY_FORMAT);
  assert.equal(replay.actions[0].summaryBefore.length,8);
  assert.equal(replay.actions[0].summaryAfter.length,8);
  assert.equal(replay.checkpoints[0].step,1);
  assert.equal(validateReplayDocument(replay),true);
});
```

- [ ] **Step 2: Run the replay test and verify RED**

Run:

```bash
node --test tests/simulation-replay.test.mjs
```

Expected: FAIL because `src/simulation/replay.js` does not exist.

- [ ] **Step 3: Implement JSON-safe normalization and deterministic projection**

Use explicit fields so log timestamps/UUIDs never affect summaries:

```js
export const REPLAY_FORMAT='tichu-dev-replay-v1';

const cloneCard=card=>card?{...card}:card;
const clonePlay=play=>play?{...play,cards:(play.cards||[]).map(cloneCard)}:null;

export function normalizeState(state){
  return {
    ...state,
    selected:[...(state.selected||[])],
    hands:(state.hands||[]).map(hand=>hand.map(cloneCard)),
    captured:(state.captured||[]).map(pile=>pile.map(cloneCard)),
    remainingDeck:(state.remainingDeck||[]).map(cloneCard),
    table:(state.table||[]).map(entry=>({seat:entry.seat,cards:entry.cards.map(cloneCard),play:clonePlay(entry.play)})),
    lastPlay:clonePlay(state.lastPlay),
    log:(state.log||[]).map(entry=>({...entry})),
  };
}

export function deterministicState(state){
  return {
    phase:state.phase,round:state.round,currentPlayer:state.currentPlayer,trickLeader:state.trickLeader,
    hands:state.hands.map(hand=>hand.map(card=>card.id)),
    remainingDeck:(state.remainingDeck||[]).map(card=>card.id),
    captured:state.captured.map(pile=>pile.map(card=>card.id)),
    table:state.table.map(entry=>({seat:entry.seat,cards:entry.cards.map(card=>card.id),playType:entry.play?.type||null,playValue:entry.play?.value??null})),
    lastPlay:state.lastPlay?{type:state.lastPlay.type,value:state.lastPlay.value??null,cards:state.lastPlay.cards.map(card=>card.id)}:null,
    passes:state.passes,wish:state.wish,finished:[...state.finished],
    passSelections:JSON.parse(JSON.stringify(state.passSelections||{})),
    exchangeDone:[...state.exchangeDone],declarations:[...state.declarations],
    scores:[...state.scores],roundScore:[...state.roundScore],winnerTeam:state.winnerTeam,
    dragonRecipient:state.dragonRecipient,pendingRoundEnd:state.pendingRoundEnd,
  };
}
```

- [ ] **Step 4: Implement 32-bit FNV-1a summary and replay helpers**

```js
export function stateSummary(state){
  const text=JSON.stringify(deterministicState(state));
  let hash=2166136261;
  for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);
  return (hash>>>0).toString(16).padStart(8,'0');
}
```

`createReplay` must create `{format,createdAt,seed,engineVersion,gitSha,config,initial:{state},actions:[],checkpoints:[],failure:null}`. `recordReplayAction` stores copied payload plus `summaryBefore`/`summaryAfter`; `recordReplayCheckpoint` stores a normalized full state; `recordReplayFailure` stores normalized before/after states and `replay.actions.slice(-20)` as `recentActions`. `validateReplayDocument` must reject wrong format, non-array `actions`, missing seed, or missing initial state.

- [ ] **Step 5: Run focused test and all unit tests**

Run:

```bash
node --test tests/simulation-replay.test.mjs
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/simulation/replay.js tests/simulation-replay.test.mjs
git commit -m "feat: add deterministic replay primitives"
```

---

### Task 4: Invariant checker

**Files:**
- Create: `src/simulation/invariants.js`
- Test: `tests/simulation-invariants.test.mjs`

**Interfaces:**
- Produces: `class SimulationInvariantError extends Error { code; details; }`
- Produces: `assertSimulationInvariants(state,{expectedDeckIds,previousScores}={}): true`
- Active card-conservation phases: `grand`, `exchange`, `play`.
- Terminal/bookkeeping phases `round-end` and `match-end` still validate known card IDs and no duplicates inside an individual pile/hand, but do not require global uniqueness because current scoring bookkeeping can copy captured cards before the next round resets state.

- [ ] **Step 1: Write failing tests for malformed states**

Create `tests/simulation-invariants.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDeck } from '../src/rules.js';
import { TichuGame } from '../src/game.js';
import { createSeededRng } from '../src/simulation/rng.js';
import { SimulationInvariantError,assertSimulationInvariants } from '../src/simulation/invariants.js';

const deckIds=makeDeck().map(card=>card.id);
const gameAtGrand=()=>{
  const game=new TichuGame({rng:createSeededRng(21),autoSchedule:false});
  game.resetMatch({names:['A','B','C','D'],botSeats:[0,1,2,3]});
  return game;
};

test('valid freshly dealt state satisfies invariants', () => {
  const game=gameAtGrand();
  assert.equal(assertSimulationInvariants(game.state,{expectedDeckIds:deckIds}),true);
});

test('duplicate live card is reported as CARD_CONSERVATION', () => {
  const game=gameAtGrand();
  game.state.hands[1].push(game.state.hands[0][0]);
  assert.throws(
    ()=>assertSimulationInvariants(game.state,{expectedDeckIds:deckIds}),
    error=>error instanceof SimulationInvariantError&&error.code==='CARD_CONSERVATION',
  );
});

test('finished current player is reported as TURN_COHERENCE', () => {
  const game=gameAtGrand();
  for(let seat=0;seat<4;seat++)game.declareGrand(seat,false);
  for(let seat=0;seat<4;seat++)game.botExchange(seat);
  game.state.finished=[game.state.currentPlayer];
  assert.throws(
    ()=>assertSimulationInvariants(game.state,{expectedDeckIds:deckIds}),
    error=>error.code==='TURN_COHERENCE',
  );
});

test('duplicate finisher is reported as FINISH_COHERENCE', () => {
  const game=gameAtGrand();
  game.state.finished=[1,1];
  assert.throws(
    ()=>assertSimulationInvariants(game.state,{expectedDeckIds:deckIds}),
    error=>error.code==='FINISH_COHERENCE',
  );
});
```

- [ ] **Step 2: Run and verify RED**

Run:

```bash
node --test tests/simulation-invariants.test.mjs
```

Expected: FAIL because invariant module does not exist.

- [ ] **Step 3: Implement invariant error and card-location accounting**

Use a helper that records `{id,location}` for hands, table, captured piles, and `remainingDeck`. For `grand`/`exchange`/`play`, compare the sorted observed IDs to sorted `expectedDeckIds` and throw:

```js
throw new SimulationInvariantError('CARD_CONSERVATION','Expected each Tichu card exactly once in live state',{duplicates,missing,unknown});
```

Also reject duplicate IDs within every individual hand/captured pile in every phase.

- [ ] **Step 4: Implement state/turn/exchange/special/finish checks**

Enforce these exact checks:

```js
const validPhases=new Set(['menu','grand','exchange','play','round-end','match-end']);
const isSeat=value=>Number.isInteger(value)&&value>=0&&value<4;
```

- invalid phase/currentPlayer/trickLeader => `STATE_COHERENCE`;
- duplicate `finished` seat => `FINISH_COHERENCE`;
- in `play`, `currentPlayer` in `finished` while fewer than 3 players are finished => `TURN_COHERENCE`;
- `passes < 0` or `passes > Math.max(0,3-state.finished.length)` => `TURN_COHERENCE`;
- `lastPlay === null` with non-empty `table`, or non-null `lastPlay` with empty `table` => `TRICK_COHERENCE`;
- during `exchange`, every `exchangeDone[seat]` requires exactly three distinct IDs in `passSelections[seat]`, all owned by that seat at lock time only when ownership can still be verified; after `phase==='play'`, all four hands must contain 14 cards at exchange resolution entry (driver checks immediately after the resolving action);
- non-null wish must be integer 2..14 => `WISH_COHERENCE`;
- `dragonRecipient==='needed'` is allowed only in `play` and only with non-empty table whose latest winning card is Dragon => `DRAGON_COHERENCE`;
- all score/roundScore entries must be finite => `SCORE_COHERENCE`;
- `match-end` requires `winnerTeam` 0 or 1, unequal scores, and at least one score >=1000 => `SCORE_COHERENCE`.

Do not infer strategy quality in invariants. Wish enforcement remains guaranteed by `playCards`/`pass`; driver tests will additionally assert rejected illegal passing when a fulfillable wish is present.

- [ ] **Step 5: Run invariant and full unit suite**

Run:

```bash
node --test tests/simulation-invariants.test.mjs
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/simulation/invariants.js tests/simulation-invariants.test.mjs
git commit -m "feat: add simulation invariant checks"
```

---

### Task 5: Synchronous simulation driver and replay execution

**Files:**
- Create: `src/simulation/driver.js`
- Test: `tests/simulation-driver.test.mjs`

**Interfaces:**
- Produces: `nextSimulationAction(game): action`
- Produces: `applySimulationAction(game,action): void`
- Produces: `runDeterministicMatch({seed,stepLimit=10000,checkpointEvery=100,engineVersion='0.2.0',gitSha=null}): {ok:true,seed,steps,replay,finalState} | {ok:false,seed,steps,replay,error}`
- Produces: `runSimulationBatch({matches=100,baseSeed=1,stepLimit=10000,checkpointEvery=100,engineVersion='0.2.0',gitSha=null,onProgress=null}): {ok:true,matches,steps} | {ok:false,matchIndex,seed,result}`
- Produces: `replayDeterministicMatch(replay): {ok:true,step,finalSummary} | {ok:false,step,message,expected,actual}`

- [ ] **Step 1: Write failing full-match determinism tests**

Create `tests/simulation-driver.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { runDeterministicMatch,runSimulationBatch,replayDeterministicMatch } from '../src/simulation/driver.js';

test('same seed produces identical deterministic action summaries', () => {
  const a=runDeterministicMatch({seed:738,stepLimit:10000,checkpointEvery:25});
  const b=runDeterministicMatch({seed:738,stepLimit:10000,checkpointEvery:25});
  assert.equal(a.ok,true);
  assert.equal(b.ok,true);
  assert.deepEqual(
    a.replay.actions.map(action=>[action.type,action.summaryBefore,action.summaryAfter]),
    b.replay.actions.map(action=>[action.type,action.summaryBefore,action.summaryAfter]),
  );
  assert.equal(a.finalState.phase,'match-end');
});

test('saved replay action stream reproduces to the same final summary', () => {
  const result=runDeterministicMatch({seed:99,stepLimit:10000,checkpointEvery:20});
  assert.equal(result.ok,true);
  const replayed=replayDeterministicMatch(result.replay);
  assert.equal(replayed.ok,true);
  assert.equal(replayed.finalSummary,result.replay.actions.at(-1).summaryAfter);
});

test('batch runner completes multiple seeded matches', () => {
  const result=runSimulationBatch({matches:10,baseSeed:1000,stepLimit:10000});
  assert.equal(result.ok,true);
  assert.equal(result.matches,10);
  assert.ok(result.steps>0);
});
```

- [ ] **Step 2: Run and verify RED**

Run:

```bash
node --test tests/simulation-driver.test.mjs
```

Expected: FAIL because driver module does not exist.

- [ ] **Step 3: Implement deterministic action selection**

`nextSimulationAction(game)` must return exactly one mutation per loop:

```js
export function nextSimulationAction(game){
  const s=game.state;
  if(s.phase==='grand'){
    const seat=s.declarations.findIndex(value=>!value);
    return {type:'declareGrand',seat,payload:{yes:game.botWantsGrand(seat)}};
  }
  if(s.phase==='exchange'){
    const seat=s.exchangeDone.findIndex(done=>!done);
    return {type:'submitExchange',seat,payload:{map:game.botExchangeMap(seat)}};
  }
  if(s.phase==='play'){
    if(s.dragonRecipient==='needed'){
      const winner=s.table.at(-1)?.seat;
      const recipient=[0,1,2,3].find(seat=>seat%2!==winner%2);
      return {type:'chooseDragonRecipient',seat:winner,payload:{recipient}};
    }
    const seat=s.currentPlayer;
    if(s.hands[seat].length===14&&s.declarations[seat]==='none'&&game.botShouldTichu(seat)){
      return {type:'declareTichu',seat,payload:{}};
    }
    const choice=game.botPlayChoice(seat);
    if(choice?.type==='pass')return {type:'pass',seat,payload:{}};
    if(choice?.type==='play')return {type:'playCards',seat,payload:{ids:choice.ids,wishRank:choice.wishRank}};
    throw new Error(`No simulation action for play seat ${seat}`);
  }
  if(s.phase==='round-end')return {type:'nextRound',seat:null,payload:{}};
  if(s.phase==='match-end')return {type:'matchComplete',seat:null,payload:{}};
  throw new Error(`Unsupported simulation phase ${s.phase}`);
}
```

- [ ] **Step 4: Implement action application using only public game APIs**

`applySimulationAction` switches on the action type and treats rejected mutations as errors:

```js
export function applySimulationAction(game,action){
  let result;
  switch(action.type){
    case 'declareGrand': result=game.declareGrand(action.seat,action.payload.yes); break;
    case 'submitExchange': result=game.submitExchange(action.seat,action.payload.map); break;
    case 'declareTichu': result=game.declareTichu(action.seat); break;
    case 'pass': result=game.pass(action.seat); break;
    case 'playCards': {
      const played=game.playCards(action.seat,action.payload.ids,action.payload.wishRank);
      result=played.ok;
      break;
    }
    case 'chooseDragonRecipient': game.chooseDragonRecipient(action.payload.recipient); result=true; break;
    case 'nextRound': game.nextRound(); result=game.state.phase==='grand'; break;
    case 'matchComplete': return;
    default: throw new Error(`Unknown simulation action ${action.type}`);
  }
  if(result!==true)throw new Error(`Simulation action rejected: ${action.type} seat=${action.seat}`);
}
```

- [ ] **Step 5: Implement full-match loop, checkpoints, invariant checks, and deadlock budget**

At startup:

```js
const game=new TichuGame({rng:createSeededRng(seed),autoSchedule:false,botDelay:0});
game.resetMatch({names:['Bot A','Bot B','Bot C','Bot D'],botSeats:[0,1,2,3]});
```

Create replay immediately after reset, call `assertSimulationInvariants` before the loop, then for each step:

1. capture `beforeState=normalizeState(game.state)` and `beforeSummary=stateSummary(game.state)`;
2. choose/apply one action;
3. increment `step`;
4. call `assertSimulationInvariants(game.state,{expectedDeckIds})`;
5. record replay action using before/after states;
6. every `checkpointEvery` steps record a full checkpoint;
7. track consecutive repeated summaries; if the same summary appears 3 consecutive post-action times, throw `SimulationInvariantError('DEADLOCK',...)`;
8. if `step > stepLimit`, throw `SimulationInvariantError('STEP_LIMIT',...)`;
9. stop only when phase is `match-end`.

Catch all errors. Convert non-invariant errors to failure code `SIMULATION_ERROR`; call `recordReplayFailure`; return `{ok:false,...}` instead of swallowing diagnostic state.

- [ ] **Step 6: Implement replay executor and batch runner**

`replayDeterministicMatch(replay)` must:

- call `validateReplayDocument(replay)`;
- construct a fresh game using `createSeededRng(replay.seed)` and `autoSchedule:false`;
- `resetMatch` with four bot seats;
- verify initial `stateSummary` equals the summary of `replay.initial.state`;
- apply each recorded action in order;
- after each action compare `stateSummary(game.state)` to `action.summaryAfter`;
- return first divergence with `{ok:false,step,message,expected,actual}`;
- return `{ok:true,step,finalSummary}` after all actions.

`runSimulationBatch` uses seeds `baseSeed + index`, stops at first failed match, and aggregates total steps.

- [ ] **Step 7: Run driver tests and a small manual stress pass**

Run:

```bash
node --test tests/simulation-driver.test.mjs
node --input-type=module -e "import {runSimulationBatch} from './src/simulation/driver.js'; const r=runSimulationBatch({matches:50,baseSeed:1}); console.log(r); if(!r.ok) process.exit(1)"
```

Expected: tests PASS and the 50-match run returns `{ok:true,...}`. If a real game-engine bug is exposed, stop implementation, save the failing seed/state, add a targeted regression, and fix the engine under systematic debugging before continuing.

- [ ] **Step 8: Commit**

```bash
git add src/simulation/driver.js tests/simulation-driver.test.mjs
git commit -m "feat: add deterministic full-match simulator"
```

---

### Task 6: Simulation and replay CLI, failure artifacts

**Files:**
- Create: `scripts/simulate.mjs`
- Create: `scripts/replay.mjs`
- Modify: `package.json`
- Modify: `.gitignore`
- Test: `tests/simulation-driver.test.mjs`

**Interfaces:**
- `npm run sim` => defaults to 100 matches, base seed 1, step limit 10000, output dir `artifacts/replays`.
- `npm run sim -- --matches 1000 --seed 50000 --out artifacts/replays`
- `npm run replay -- artifacts/replays/failure-seed-738.json`
- `npm run test:sim` => exactly `node scripts/simulate.mjs --matches 100 --seed 1 --quiet`.

- [ ] **Step 1: Add a failing CLI argument-parser test surface**

Export parsers from the scripts without running `main()` when imported:

```js
// scripts/simulate.mjs
export function parseSimulationArgs(argv){ /* implemented in Step 3 */ }
```

Add to `tests/simulation-driver.test.mjs`:

```js
import { parseSimulationArgs } from '../scripts/simulate.mjs';

test('simulation CLI parses deterministic batch options', () => {
  assert.deepEqual(
    parseSimulationArgs(['--matches','250','--seed','500','--out','tmp/replays','--quiet']),
    {matches:250,baseSeed:500,stepLimit:10000,outDir:'tmp/replays',quiet:true},
  );
});
```

- [ ] **Step 2: Run and verify RED**

Run:

```bash
node --test tests/simulation-driver.test.mjs
```

Expected: FAIL because `scripts/simulate.mjs` does not exist.

- [ ] **Step 3: Implement `scripts/simulate.mjs`**

Parser defaults:

```js
const options={matches:100,baseSeed:1,stepLimit:10000,outDir:'artifacts/replays',quiet:false};
```

Accept only `--matches <positive integer>`, `--seed <integer>`, `--step-limit <positive integer>`, `--out <path>`, `--quiet`. Reject unknown/missing values with a thrown `Error` and exit code 2 from `main`.

Read `package.json` to set `engineVersion`, use `process.env.GITHUB_SHA || null` for `gitSha`, call `runSimulationBatch`, and on failure:

```js
await mkdir(options.outDir,{recursive:true});
const filename=join(options.outDir,`failure-seed-${result.seed}.json`);
await writeFile(filename,JSON.stringify(result.result.replay,null,2)+'\n','utf8');
console.error(`Invariant failed: ${result.result.replay.failure?.code||'SIMULATION_ERROR'}`);
console.error(`seed=${result.seed} match=${result.matchIndex+1} round=${result.result.replay.failure?.round} step=${result.result.steps}`);
console.error(`replay=${filename}`);
process.exitCode=1;
```

When successful, print one final summary unless `--quiet`.

- [ ] **Step 4: Implement `scripts/replay.mjs`**

Require exactly one positional JSON path. Read/parse file, call `replayDeterministicMatch`, print:

```text
Replay OK: seed=<seed> steps=<step> final=<summary>
```

or on divergence:

```text
Replay diverged at step <step>: expected=<expected> actual=<actual>
```

and set exit code 1.

- [ ] **Step 5: Wire package scripts and ignored artifact directory**

Modify `package.json` scripts to include:

```json
"test:sim": "node scripts/simulate.mjs --matches 100 --seed 1 --quiet",
"sim": "node scripts/simulate.mjs",
"replay": "node scripts/replay.mjs"
```

Append to `.gitignore`:

```text
artifacts/replays/
```

- [ ] **Step 6: Run CLI tests and real commands**

Run:

```bash
node --test tests/simulation-driver.test.mjs
npm run sim -- --matches 10 --seed 1
npm run test:sim
```

Expected: all PASS/exit 0. Confirm `git status --ignored` lists `artifacts/replays/` as ignored if a failure artifact was generated during debugging.

- [ ] **Step 7: Commit**

```bash
git add scripts/simulate.mjs scripts/replay.mjs package.json .gitignore tests/simulation-driver.test.mjs
git commit -m "feat: add simulation and replay CLI"
```

---

### Task 7: CI integration, developer documentation, and complete verification

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Test: all unit tests, simulation smoke, Playwright.

**Interfaces:**
- CI order: install => unit tests => deterministic 100-match simulation => Playwright browser install => Playwright tests => screenshot artifact upload.
- README commands exactly match package scripts.

- [ ] **Step 1: Add deterministic simulation to CI**

Insert after `npm test` in `.github/workflows/ci.yml`:

```yaml
      - run: npm run test:sim
```

Keep Playwright installation/tests and screenshot upload unchanged.

- [ ] **Step 2: Document simulation/replay workflow in README**

Add a `## Testy deterministyczne i replay` section containing:

```markdown
Szybki deterministyczny smoke test 100 pełnych meczów:

```bash
npm run test:sim
```

Większy lokalny przebieg:

```bash
npm run sim -- --matches 1000 --seed 1
```

Przy błędzie symulator zapisuje pełny developerski replay w `artifacts/replays/`. Plik zawiera ukryte ręce wszystkich graczy i służy wyłącznie do diagnostyki; katalog jest ignorowany przez Git.

Odtworzenie błędu:

```bash
npm run replay -- artifacts/replays/failure-seed-738.json
```
```

- [ ] **Step 3: Run all unit and deterministic tests**

Run:

```bash
npm test
npm run test:sim
npm run sim -- --matches 1000 --seed 1 --quiet
```

Expected: all commands exit 0. Record elapsed time for the 100-match CI sample; if it is unreasonably slow for every PR, optimize the harness without lowering the 100-match acceptance target unless the spec is revised explicitly.

- [ ] **Step 4: Run complete Playwright suite**

Run:

```bash
npm run test:e2e
```

Expected: all existing desktop/phone tests remain green with only their pre-existing breakpoint-specific skips.

- [ ] **Step 5: Verify no developer replay data is imported by production browser code**

Run:

```bash
grep -R "simulation/replay\|simulation/driver\|artifacts/replays" index.html src/ui*.js src/multiplayer.js || true
```

Expected: no production UI or multiplayer imports/references to replay/driver modules.

- [ ] **Step 6: Verify generated artifacts stay untracked**

Run:

```bash
git status --short --ignored artifacts/replays
```

Expected: generated files appear with `!!` and are not staged/tracked.

- [ ] **Step 7: Commit CI/docs**

```bash
git add .github/workflows/ci.yml README.md
git commit -m "ci: run deterministic Tichu match simulations"
```

- [ ] **Step 8: Final branch verification before PR**

Run:

```bash
npm test && npm run test:sim && npm run test:e2e
git status --short
```

Expected: all commands PASS and working tree is clean except intentionally ignored replay artifacts.

- [ ] **Step 9: Open PR with evidence**

PR summary must state:

- deterministic seeded RNG + timer-free simulation seam;
- shared bot decisions, no second rules engine;
- invariant coverage and deadlock/step-limit detection;
- developer-only hidden-state replay format and replay CLI;
- exact unit/simulation/Playwright results;
- number of matches and seed range used for the final stress run;
- any real engine bugs discovered by simulation and their regression seeds.
