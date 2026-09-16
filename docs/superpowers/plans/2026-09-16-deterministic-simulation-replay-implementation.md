# Deterministic Simulation and Replay Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic headless Tichu simulation harness that runs complete bot-vs-bot matches, asserts invariants after every transition, and reproduces failures from developer replay JSON files.

**Architecture:** `TichuGame` remains the only game/rules authority. Add injectable RNG, optional automatic scheduling, and pure bot-decision helpers reused by production timers and simulation. New `src/simulation/*` modules provide seeded RNG, replay/state serialization, transition-aware invariants, and a synchronous driver; Node scripts provide batch simulation and replay CLI without exposing hidden developer state to browser UI or multiplayer.

**Tech Stack:** Node.js 22, ES modules, built-in `node:test`, existing Tichu game/rules engine, GitHub Actions, existing Playwright suite.

**Spec:** `docs/superpowers/specs/2026-09-16-deterministic-simulation-replay-design.md`

## Global Constraints

- Normal application behavior defaults to `Math.random()` and timer-driven bot scheduling.
- No global monkey-patching of `Math.random()`.
- `autoSchedule=false` disables timers only; it must not alter rules, scoring, bot strategy, or UI-visible game state.
- Simulation must call existing `TichuGame`/rules APIs rather than implementing a second rules engine.
- Developer replays may contain all four hidden hands but must never be imported or emitted by production UI or multiplayer code.
- Generated failure replays live under `artifacts/replays/` and are ignored by Git.
- Replay format is exactly `tichu-dev-replay-v1`.
- Replay `engineVersion` is the package version; optional `gitSha` is metadata only and is excluded from deterministic comparison.
- CI runs 100 complete deterministic matches on every push/PR; 1,000–10,000+ runs remain manual/local.
- Existing unit and Playwright suites remain required and green.

---

## File Map

- Modify `src/game.js` — RNG injection, scheduling seam, pure bot decision helpers.
- Create `src/simulation/rng.js` — seeded PRNG.
- Create `src/simulation/replay.js` — JSON-safe state normalization, deterministic projection/summary, replay document helpers.
- Create `src/simulation/invariants.js` — transition-aware invariant checks.
- Create `src/simulation/driver.js` — synchronous action selection/application, match runner, batch runner, replay executor.
- Create `scripts/simulate.mjs` — batch CLI and failure replay writer.
- Create `scripts/replay.mjs` — replay CLI.
- Modify `package.json` — add `sim`, `replay`, `test:sim`.
- Modify `.gitignore` — ignore `artifacts/replays/`.
- Modify `.github/workflows/ci.yml` — run 100-match deterministic simulation before Playwright.
- Modify `README.md` — document developer simulation/replay commands.
- Create `tests/simulation-rng.test.mjs`.
- Create `tests/simulation-replay.test.mjs`.
- Create `tests/simulation-invariants.test.mjs`.
- Create `tests/simulation-driver.test.mjs`.
- Modify `tests/game.test.mjs` — bot decision compatibility coverage.

---

### Task 1: Seeded RNG and simulation-safe scheduling

**Files:**
- Create: `src/simulation/rng.js`
- Modify: `src/game.js`
- Test: `tests/simulation-rng.test.mjs`

**Interfaces:**
- Produces: `createSeededRng(seed: number|string): () => number`
- Changes constructor to: `new TichuGame({botDelay=500,rng=Math.random,autoSchedule=true}={})`
- `startRound()` shuffles through `this.rng`.
- `scheduleBots()` clears any existing timer, sets `botTimer=null`, and returns immediately when `autoSchedule===false`.

- [ ] **Step 1: Write failing RNG/deal tests**

Create `tests/simulation-rng.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { TichuGame } from '../src/game.js';
import { createSeededRng } from '../src/simulation/rng.js';

const handIds=game=>game.state.hands.map(hand=>hand.map(card=>card.id));

test('seeded RNG repeats the same stream',()=>{
  const a=createSeededRng(738);
  const b=createSeededRng(738);
  assert.deepEqual(
    Array.from({length:8},()=>a()),
    Array.from({length:8},()=>b()),
  );
});

test('same seed produces the same first deal without timers',()=>{
  const a=new TichuGame({rng:createSeededRng(738),autoSchedule:false});
  const b=new TichuGame({rng:createSeededRng(738),autoSchedule:false});
  a.resetMatch({names:['A','B','C','D'],botSeats:[0,1,2,3]});
  b.resetMatch({names:['A','B','C','D'],botSeats:[0,1,2,3]});
  assert.deepEqual(handIds(a),handIds(b));
  assert.deepEqual(a.state.remainingDeck.map(card=>card.id),b.state.remainingDeck.map(card=>card.id));
  assert.equal(a.botTimer,null);
  assert.equal(b.botTimer,null);
});

test('different seeds produce different deals',()=>{
  const a=new TichuGame({rng:createSeededRng(1),autoSchedule:false});
  const b=new TichuGame({rng:createSeededRng(2),autoSchedule:false});
  a.resetMatch({names:['A','B','C','D'],botSeats:[0,1,2,3]});
  b.resetMatch({names:['A','B','C','D'],botSeats:[0,1,2,3]});
  assert.notDeepEqual(handIds(a),handIds(b));
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test tests/simulation-rng.test.mjs
```

Expected: FAIL because `src/simulation/rng.js` and constructor options do not exist.

- [ ] **Step 3: Implement seeded PRNG**

Create `src/simulation/rng.js`:

```js
function seedToUint32(seed){
  if(typeof seed==='number'&&Number.isFinite(seed))return seed>>>0;
  const text=String(seed);
  let hash=2166136261;
  for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);
  return hash>>>0;
}

export function createSeededRng(seed){
  let state=seedToUint32(seed);
  return()=>{
    state=(state+0x6D2B79F5)>>>0;
    let t=state;
    t=Math.imul(t^(t>>>15),t|1);
    t^=t+Math.imul(t^(t>>>7),t|61);
    return((t^(t>>>14))>>>0)/4294967296;
  };
}
```

- [ ] **Step 4: Inject RNG and scheduling seam into `TichuGame`**

Use this constructor shape:

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

Change `startRound()` shuffle to:

```js
const deck=shuffle(makeDeck(),this.rng);
```

Start `scheduleBots()` with:

```js
scheduleBots(){
  clearTimeout(this.botTimer);
  this.botTimer=null;
  if(!this.autoSchedule)return;
  const s=this.state;
  // retain the existing scheduling branches verbatim after this seam
}
```

- [ ] **Step 5: Verify GREEN**

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

### Task 2: Reusable pure bot decisions

**Files:**
- Modify: `src/game.js`
- Modify: `tests/game.test.mjs`

**Interfaces:**
- Produces: `game.botExchangeMap(seat): Record<number,string>`
- Produces: `game.botPlayChoice(seat): {type:'pass'} | {type:'play',ids:string[],wishRank:number|null} | null`
- Existing `botExchange(seat)` delegates to `botExchangeMap` then `submitExchange`.
- Existing `botTurn(seat)` keeps the same Tichu declaration threshold and selection order, then delegates choice to `botPlayChoice`.

- [ ] **Step 1: Add failing purity/compatibility tests**

Append to `tests/game.test.mjs`:

```js
import { createSeededRng } from '../src/simulation/rng.js';

test('bot exchange decision is pure and wrapper applies the same map',()=>{
  const game=new TichuGame({rng:createSeededRng(11),autoSchedule:false});
  game.resetMatch({names:['A','B','C','D'],botSeats:[0,1,2,3]});
  for(let seat=0;seat<4;seat++)game.declareGrand(seat,false);
  const before=game.state.hands[0].map(card=>card.id);
  const map=game.botExchangeMap(0);
  assert.equal(new Set(Object.values(map)).size,3);
  assert.deepEqual(game.state.hands[0].map(card=>card.id),before);
  assert.equal(game.botExchange(0),true);
  assert.deepEqual(game.state.passSelections[0],map);
});

test('bot play decision is pure for the current player',()=>{
  const game=new TichuGame({rng:createSeededRng(12),autoSchedule:false});
  game.resetMatch({names:['A','B','C','D'],botSeats:[0,1,2,3]});
  for(let seat=0;seat<4;seat++)game.declareGrand(seat,false);
  for(let seat=0;seat<4;seat++)game.botExchange(seat);
  const seat=game.state.currentPlayer;
  const before=game.state.hands[seat].map(card=>card.id);
  const choice=game.botPlayChoice(seat);
  assert.ok(choice&&(choice.type==='pass'||choice.type==='play'));
  assert.deepEqual(game.state.hands[seat].map(card=>card.id),before);
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test tests/game.test.mjs
```

Expected: FAIL because `botExchangeMap` and `botPlayChoice` do not exist.

- [ ] **Step 3: Extract exchange choice**

Add:

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

- [ ] **Step 4: Extract play choice without strategy changes**

Add:

```js
botPlayChoice(seat){
  const s=this.state;
  if(s.currentPlayer!==seat||s.phase!=='play')return null;
  const opts=possibleSelections(s.hands[seat],s.lastPlay,s.wish);
  let legal=opts;
  if(s.wish&&opts.some(o=>o.fulfills))legal=opts.filter(o=>o.fulfills);
  let chosen=legal[0];
  if(!chosen)return{type:'pass'};
  const nonBomb=legal.find(o=>o.play.type!=='bomb');
  if(nonBomb)chosen=nonBomb;
  const wishRank=chosen.cards.some(c=>c.special==='mahjong')?this.botWish(seat,chosen.cards):null;
  return{type:'play',ids:chosen.cards.map(c=>c.id),wishRank};
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

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npm test
```

Expected: all unit tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game.js tests/game.test.mjs
git commit -m "refactor: expose deterministic bot decisions"
```

---

### Task 3: Replay normalization and deterministic state summaries

**Files:**
- Create: `src/simulation/replay.js`
- Create: `tests/simulation-replay.test.mjs`

**Interfaces:**
- `REPLAY_FORMAT = 'tichu-dev-replay-v1'`
- `normalizeState(state): object`
- `deterministicState(state): object`
- `stateSummary(state): string` returns 8-character lowercase FNV-1a hex.
- `createReplay({seed,engineVersion,gitSha=null,config,initialState}): object`
- `recordReplayAction(replay,{step,round,seat,type,payload,beforeState,afterState}): object`
- `recordReplayCheckpoint(replay,step,state): void`
- `recordReplayFailure(replay,{code,message,step,round,action,beforeState,afterState}): void`
- `validateReplayDocument(replay): true` or throws `Error`.

- [ ] **Step 1: Write failing replay tests**

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

test('normalizeState converts Set and remains JSON-safe',()=>{
  const game=makeGame();
  const id=game.state.hands[0][0].id;
  game.state.selected.add(id);
  const normalized=normalizeState(game.state);
  assert.deepEqual(normalized.selected,[id]);
  assert.doesNotThrow(()=>JSON.stringify(normalized));
  assert.equal(normalized.hands.length,4);
});

test('stateSummary ignores log UUID and timestamp noise',()=>{
  const game=makeGame();
  const before=stateSummary(game.state);
  game.state.log.unshift({id:'noise',text:'diagnostic only',time:999999});
  assert.equal(stateSummary(game.state),before);
});

test('replay records summaries and checkpoints',()=>{
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

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test tests/simulation-replay.test.mjs
```

Expected: FAIL because `src/simulation/replay.js` does not exist.

- [ ] **Step 3: Implement JSON-safe normalization**

Create `src/simulation/replay.js` with these foundations:

```js
export const REPLAY_FORMAT='tichu-dev-replay-v1';

const cloneCard=card=>card?{...card}:card;
const clonePlay=play=>play?{...play,cards:(play.cards||[]).map(cloneCard)}:null;

export function normalizeState(state){
  return{
    ...state,
    selected:[...(state.selected||[])],
    hands:(state.hands||[]).map(hand=>hand.map(cloneCard)),
    captured:(state.captured||[]).map(pile=>pile.map(cloneCard)),
    remainingDeck:(state.remainingDeck||[]).map(cloneCard),
    table:(state.table||[]).map(entry=>({seat:entry.seat,cards:entry.cards.map(cloneCard),play:clonePlay(entry.play)})),
    lastPlay:clonePlay(state.lastPlay),
    passSelections:JSON.parse(JSON.stringify(state.passSelections||{})),
    log:(state.log||[]).map(entry=>({...entry})),
  };
}
```

- [ ] **Step 4: Implement deterministic projection and summary**

Use only stable game fields:

```js
export function deterministicState(state){
  return{
    phase:state.phase,
    round:state.round,
    currentPlayer:state.currentPlayer,
    trickLeader:state.trickLeader,
    hands:state.hands.map(hand=>hand.map(card=>card.id)),
    remainingDeck:(state.remainingDeck||[]).map(card=>card.id),
    captured:state.captured.map(pile=>pile.map(card=>card.id)),
    table:state.table.map(entry=>({seat:entry.seat,cards:entry.cards.map(card=>card.id),playType:entry.play?.type||null,playValue:entry.play?.value??null})),
    lastPlay:state.lastPlay?{type:state.lastPlay.type,value:state.lastPlay.value??null,cards:state.lastPlay.cards.map(card=>card.id)}:null,
    passes:state.passes,
    wish:state.wish,
    finished:[...state.finished],
    passSelections:JSON.parse(JSON.stringify(state.passSelections||{})),
    exchangeDone:[...state.exchangeDone],
    declarations:[...state.declarations],
    scores:[...state.scores],
    roundScore:[...state.roundScore],
    winnerTeam:state.winnerTeam,
    dragonRecipient:state.dragonRecipient,
    pendingRoundEnd:state.pendingRoundEnd,
  };
}

export function stateSummary(state){
  const text=JSON.stringify(deterministicState(state));
  let hash=2166136261;
  for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);
  return(hash>>>0).toString(16).padStart(8,'0');
}
```

- [ ] **Step 5: Implement replay document helpers**

Use these exact shapes:

```js
export function createReplay({seed,engineVersion,gitSha=null,config,initialState}){
  return{
    format:REPLAY_FORMAT,
    createdAt:new Date().toISOString(),
    seed,
    engineVersion,
    gitSha,
    config:{...config},
    initial:{state:normalizeState(initialState)},
    actions:[],
    checkpoints:[],
    failure:null,
  };
}

export function recordReplayAction(replay,{step,round,seat,type,payload,beforeState,afterState}){
  const action={
    step,round,seat,type,payload:JSON.parse(JSON.stringify(payload||{})),
    summaryBefore:stateSummary(beforeState),
    summaryAfter:stateSummary(afterState),
  };
  replay.actions.push(action);
  return action;
}

export function recordReplayCheckpoint(replay,step,state){
  replay.checkpoints.push({step,state:normalizeState(state)});
}

export function recordReplayFailure(replay,{code,message,step,round,action,beforeState,afterState}){
  replay.failure={
    code,message,step,round,
    action:action?JSON.parse(JSON.stringify(action)):null,
    beforeState:beforeState?normalizeState(beforeState):null,
    afterState:afterState?normalizeState(afterState):null,
    recentActions:replay.actions.slice(-20).map(item=>JSON.parse(JSON.stringify(item))),
    seed:replay.seed,
  };
}

export function validateReplayDocument(replay){
  if(!replay||replay.format!==REPLAY_FORMAT)throw new Error(`Unsupported replay format: ${replay?.format}`);
  if(replay.seed===undefined||replay.seed===null)throw new Error('Replay seed is required');
  if(!replay.initial?.state)throw new Error('Replay initial state is required');
  if(!Array.isArray(replay.actions))throw new Error('Replay actions must be an array');
  return true;
}
```

- [ ] **Step 6: Verify GREEN and commit**

Run:

```bash
node --test tests/simulation-replay.test.mjs
npm test
```

Then:

```bash
git add src/simulation/replay.js tests/simulation-replay.test.mjs
git commit -m "feat: add deterministic replay primitives"
```

---

### Task 4: Transition-aware invariant checker

**Files:**
- Create: `src/simulation/invariants.js`
- Create: `tests/simulation-invariants.test.mjs`

**Interfaces:**
- `class SimulationInvariantError extends Error { code; details; }`
- `assertSimulationInvariants(state,{expectedDeckIds,previousState=null,lastAction=null}={}): true`
- Active physical-card conservation is strict in `grand`, `exchange`, and `play`.
- `round-end` and `match-end` validate known IDs and per-pile uniqueness but do not require global captured-pile uniqueness because current scoring bookkeeping copies the last player's captured cards into the first finisher before next-round reset.
- Transition-specific exchange/scoring checks use `previousState` and `lastAction`, never inference from post-state alone.

- [ ] **Step 1: Write failing malformed-state tests**

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

test('freshly dealt state satisfies invariants',()=>{
  const game=gameAtGrand();
  assert.equal(assertSimulationInvariants(game.state,{expectedDeckIds:deckIds}),true);
});

test('duplicate live card is CARD_CONSERVATION',()=>{
  const game=gameAtGrand();
  game.state.hands[1].push(game.state.hands[0][0]);
  assert.throws(
    ()=>assertSimulationInvariants(game.state,{expectedDeckIds:deckIds}),
    error=>error instanceof SimulationInvariantError&&error.code==='CARD_CONSERVATION',
  );
});

test('finished current player is TURN_COHERENCE',()=>{
  const game=gameAtGrand();
  for(let seat=0;seat<4;seat++)game.declareGrand(seat,false);
  for(let seat=0;seat<4;seat++)game.botExchange(seat);
  game.state.finished=[game.state.currentPlayer];
  assert.throws(
    ()=>assertSimulationInvariants(game.state,{expectedDeckIds:deckIds}),
    error=>error.code==='TURN_COHERENCE',
  );
});

test('duplicate finisher is FINISH_COHERENCE',()=>{
  const game=gameAtGrand();
  game.state.finished=[1,1];
  assert.throws(
    ()=>assertSimulationInvariants(game.state,{expectedDeckIds:deckIds}),
    error=>error.code==='FINISH_COHERENCE',
  );
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test tests/simulation-invariants.test.mjs
```

Expected: FAIL because `src/simulation/invariants.js` does not exist.

- [ ] **Step 3: Implement error type and strict live card accounting**

Start with:

```js
export class SimulationInvariantError extends Error{
  constructor(code,message,details={}){
    super(message);
    this.name='SimulationInvariantError';
    this.code=code;
    this.details=details;
  }
}

const fail=(code,message,details={})=>{throw new SimulationInvariantError(code,message,details)};
const unique=array=>new Set(array).size===array.length;
```

Collect `{id,location}` across `hands`, `table`, `captured`, and `remainingDeck`. In `grand`/`exchange`/`play`, sorted observed IDs must exactly equal sorted `expectedDeckIds`; duplicates, missing IDs, or unknown IDs throw `CARD_CONSERVATION`. Every individual hand and captured pile must also contain unique IDs in every phase.

- [ ] **Step 4: Implement state, turn, trick, wish, finish and score checks**

Use:

```js
const validPhases=new Set(['menu','grand','exchange','play','round-end','match-end']);
const isSeat=value=>Number.isInteger(value)&&value>=0&&value<4;
```

Enforce:

- invalid phase/currentPlayer/trickLeader => `STATE_COHERENCE`;
- duplicate/invalid `finished` seats => `FINISH_COHERENCE`;
- in `play`, a `currentPlayer` already in `finished` while fewer than 3 players are finished => `TURN_COHERENCE`;
- `passes<0` or `passes>Math.max(0,3-state.finished.length)` => `TURN_COHERENCE`;
- `lastPlay===null` with non-empty `table`, or non-null `lastPlay` with empty `table` => `TRICK_COHERENCE`;
- non-null wish not an integer in 2..14 => `WISH_COHERENCE`;
- `dragonRecipient==='needed'` outside `play`, with empty table, or when latest winning entry is not single Dragon => `DRAGON_COHERENCE`;
- non-finite `scores`/`roundScore` => `SCORE_COHERENCE`;
- `match-end` without winner 0/1, with tied scores, or with both scores below 1000 => `SCORE_COHERENCE`.

- [ ] **Step 5: Add exact transition-aware exchange/scoring tests**

Append:

```js
test('final exchange transition requires four 14-card hands',()=>{
  const game=gameAtGrand();
  for(let seat=0;seat<4;seat++)game.declareGrand(seat,false);
  for(let seat=0;seat<3;seat++)game.botExchange(seat);
  const previous=structuredClone({...game.state,selected:[...game.state.selected]});
  const map=game.botExchangeMap(3);
  game.submitExchange(3,map);
  assert.equal(game.state.phase,'play');
  assert.equal(assertSimulationInvariants(game.state,{
    expectedDeckIds:deckIds,
    previousState:previous,
    lastAction:{type:'submitExchange',seat:3,payload:{map}},
  }),true);
});
```

Inside `assertSimulationInvariants`, when `lastAction.type==='submitExchange'`:

1. validate `lastAction.payload.map` has exactly the three targets other than `seat`;
2. validate its three card IDs are distinct and exist in `previousState.hands[seat]`;
3. if `previousState.phase==='exchange' && state.phase==='play'`, require `state.exchangeDone.every(Boolean)` and `state.hands.every(hand=>hand.length===14)`.

When `previousState.phase==='play'` and `state.phase` becomes `round-end` or `match-end`, require:

```js
state.scores[0]-previousState.scores[0]===state.roundScore[0]
state.scores[1]-previousState.scores[1]===state.roundScore[1]
```

Otherwise throw `SCORE_COHERENCE`.

- [ ] **Step 6: Verify GREEN and commit**

Run:

```bash
node --test tests/simulation-invariants.test.mjs
npm test
```

Then:

```bash
git add src/simulation/invariants.js tests/simulation-invariants.test.mjs
git commit -m "feat: add simulation invariant checks"
```

---

### Task 5: Synchronous full-match driver and replay executor

**Files:**
- Create: `src/simulation/driver.js`
- Create: `tests/simulation-driver.test.mjs`

**Interfaces:**
- `nextSimulationAction(game): action`
- `applySimulationAction(game,action): void`
- `runDeterministicMatch({seed,stepLimit=10000,checkpointEvery=100,engineVersion='0.2.0',gitSha=null}): success|failure result`
- `runSimulationBatch({matches=100,baseSeed=1,stepLimit=10000,checkpointEvery=100,engineVersion='0.2.0',gitSha=null,onProgress=null}): batch result`
- `replayDeterministicMatch(replay): replay result`

Success result:

```js
{ok:true,seed,steps,replay,finalState}
```

Failure result:

```js
{ok:false,seed,steps,replay,error}
```

- [ ] **Step 1: Write failing deterministic full-match tests**

Create `tests/simulation-driver.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { runDeterministicMatch,runSimulationBatch,replayDeterministicMatch } from '../src/simulation/driver.js';

test('same seed produces identical action summaries',()=>{
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

test('recorded action stream replays to the same final summary',()=>{
  const result=runDeterministicMatch({seed:99,stepLimit:10000,checkpointEvery:20});
  assert.equal(result.ok,true);
  const replayed=replayDeterministicMatch(result.replay);
  assert.equal(replayed.ok,true);
  assert.equal(replayed.finalSummary,result.replay.actions.at(-1).summaryAfter);
});

test('batch runner completes ten deterministic matches',()=>{
  const result=runSimulationBatch({matches:10,baseSeed:1000,stepLimit:10000});
  assert.equal(result.ok,true);
  assert.equal(result.matches,10);
  assert.ok(result.steps>0);
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test tests/simulation-driver.test.mjs
```

Expected: FAIL because driver module does not exist.

- [ ] **Step 3: Implement action selection**

Use exactly one game mutation per loop:

```js
export function nextSimulationAction(game){
  const s=game.state;
  if(s.phase==='grand'){
    const seat=s.declarations.findIndex(value=>!value);
    return{type:'declareGrand',seat,payload:{yes:game.botWantsGrand(seat)}};
  }
  if(s.phase==='exchange'){
    const seat=s.exchangeDone.findIndex(done=>!done);
    return{type:'submitExchange',seat,payload:{map:game.botExchangeMap(seat)}};
  }
  if(s.phase==='play'){
    if(s.dragonRecipient==='needed'){
      const winner=s.table.at(-1).seat;
      const recipient=[0,1,2,3].find(seat=>seat%2!==winner%2);
      return{type:'chooseDragonRecipient',seat:winner,payload:{recipient}};
    }
    const seat=s.currentPlayer;
    if(s.hands[seat].length===14&&s.declarations[seat]==='none'&&game.botShouldTichu(seat)){
      return{type:'declareTichu',seat,payload:{}};
    }
    const choice=game.botPlayChoice(seat);
    if(choice?.type==='pass')return{type:'pass',seat,payload:{}};
    if(choice?.type==='play')return{type:'playCards',seat,payload:{ids:choice.ids,wishRank:choice.wishRank}};
    throw new Error(`No simulation action for play seat ${seat}`);
  }
  if(s.phase==='round-end')return{type:'nextRound',seat:null,payload:{}};
  if(s.phase==='match-end')return null;
  throw new Error(`Unsupported simulation phase ${s.phase}`);
}
```

- [ ] **Step 4: Implement action application using existing game APIs**

```js
export function applySimulationAction(game,action){
  let accepted=false;
  switch(action.type){
    case'declareGrand': accepted=game.declareGrand(action.seat,action.payload.yes); break;
    case'submitExchange': accepted=game.submitExchange(action.seat,action.payload.map); break;
    case'declareTichu': accepted=game.declareTichu(action.seat); break;
    case'pass': accepted=game.pass(action.seat); break;
    case'playCards': accepted=game.playCards(action.seat,action.payload.ids,action.payload.wishRank).ok; break;
    case'chooseDragonRecipient': {
      game.chooseDragonRecipient(action.payload.recipient);
      accepted=game.state.dragonRecipient!=='needed';
      break;
    }
    case'nextRound': {
      game.nextRound();
      accepted=game.state.phase==='grand';
      break;
    }
    default: throw new Error(`Unknown simulation action ${action.type}`);
  }
  if(!accepted)throw new Error(`Simulation action rejected: ${action.type} seat=${action.seat}`);
}
```

- [ ] **Step 5: Implement match loop, invariants, checkpoints and deadlock protection**

Initialize:

```js
const game=new TichuGame({rng:createSeededRng(seed),autoSchedule:false,botDelay:0});
game.resetMatch({names:['Bot A','Bot B','Bot C','Bot D'],botSeats:[0,1,2,3]});
```

Before the loop create replay and validate initial invariants. For each iteration:

```js
if(game.state.phase==='match-end')break;
if(step>=stepLimit)throw new SimulationInvariantError('STEP_LIMIT',`Step limit ${stepLimit} reached`,{step});

const action=nextSimulationAction(game);
const beforeState=normalizeState(game.state);
applySimulationAction(game,action);
step+=1;

assertSimulationInvariants(game.state,{
  expectedDeckIds,
  previousState:beforeState,
  lastAction:action,
});

const recorded=recordReplayAction(replay,{
  step,
  round:beforeState.round,
  seat:action.seat,
  type:action.type,
  payload:action.payload,
  beforeState,
  afterState:game.state,
});

if(step%checkpointEvery===0)recordReplayCheckpoint(replay,step,game.state);
```

Track post-action `recorded.summaryAfter`; three consecutive identical post-action summaries throw `SimulationInvariantError('DEADLOCK','State did not advance for three transitions',{step,summary})`.

Catch errors. Invariant errors keep their code; other errors use `SIMULATION_ERROR`. Always call `recordReplayFailure` with action and before/after state available, then return `{ok:false,...}`.

- [ ] **Step 6: Implement replay executor**

`replayDeterministicMatch(replay)` must:

1. call `validateReplayDocument(replay)`;
2. construct seeded `TichuGame` with `autoSchedule:false` and four bot seats;
3. call `resetMatch`;
4. compare `stateSummary(game.state)` to `stateSummary(replay.initial.state)`;
5. apply recorded actions in order using `applySimulationAction`;
6. compare each resulting summary to `action.summaryAfter`;
7. return the first divergence:

```js
{ok:false,step:action.step,message:'State summary diverged',expected:action.summaryAfter,actual}
```

8. otherwise return:

```js
{ok:true,step:replay.actions.length,finalSummary:stateSummary(game.state)}
```

- [ ] **Step 7: Implement batch runner**

For `index=0..matches-1`, use seed `baseSeed+index`, stop at first failed match, and return:

```js
{ok:false,matchIndex:index,seed,result}
```

On success return:

```js
{ok:true,matches,steps:totalSteps}
```

Call `onProgress?.({matchIndex:index,seed,steps:result.steps})` after each successful match.

- [ ] **Step 8: Verify with tests and a 50-match stress pass**

Run:

```bash
node --test tests/simulation-driver.test.mjs
node --input-type=module -e "import {runSimulationBatch} from './src/simulation/driver.js'; const r=runSimulationBatch({matches:50,baseSeed:1}); console.log(r); if(!r.ok) process.exit(1)"
```

Expected: PASS. If a real engine bug appears, preserve its seed/replay, switch to systematic debugging, add a targeted regression, fix that engine defect, then resume this plan.

- [ ] **Step 9: Commit**

```bash
git add src/simulation/driver.js tests/simulation-driver.test.mjs
git commit -m "feat: add deterministic full-match simulator"
```

---

### Task 6: Simulation/replay CLI and failure artifacts

**Files:**
- Create: `scripts/simulate.mjs`
- Create: `scripts/replay.mjs`
- Modify: `package.json`
- Modify: `.gitignore`
- Modify: `tests/simulation-driver.test.mjs`

**Interfaces:**
- `npm run sim` defaults: 100 matches, base seed 1, step limit 10000, output `artifacts/replays`.
- `npm run sim -- --matches 1000 --seed 50000 --out artifacts/replays`.
- `npm run replay -- artifacts/replays/failure-seed-738.json`.
- `npm run test:sim` runs exactly `node scripts/simulate.mjs --matches 100 --seed 1 --quiet`.

- [ ] **Step 1: Add failing parser test**

Append to `tests/simulation-driver.test.mjs`:

```js
import { parseSimulationArgs } from '../scripts/simulate.mjs';

test('simulation CLI parses deterministic batch options',()=>{
  assert.deepEqual(
    parseSimulationArgs(['--matches','250','--seed','500','--out','tmp/replays','--quiet']),
    {matches:250,baseSeed:500,stepLimit:10000,outDir:'tmp/replays',quiet:true},
  );
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test tests/simulation-driver.test.mjs
```

Expected: FAIL because `scripts/simulate.mjs` does not exist.

- [ ] **Step 3: Implement exact argument parser**

In `scripts/simulate.mjs`:

```js
export function parseSimulationArgs(argv){
  const options={matches:100,baseSeed:1,stepLimit:10000,outDir:'artifacts/replays',quiet:false};
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(arg==='--quiet'){options.quiet=true;continue;}
    const value=argv[++i];
    if(value===undefined)throw new Error(`Missing value for ${arg}`);
    if(arg==='--matches')options.matches=Number(value);
    else if(arg==='--seed')options.baseSeed=Number(value);
    else if(arg==='--step-limit')options.stepLimit=Number(value);
    else if(arg==='--out')options.outDir=value;
    else throw new Error(`Unknown option ${arg}`);
  }
  if(!Number.isInteger(options.matches)||options.matches<1)throw new Error('--matches must be a positive integer');
  if(!Number.isInteger(options.baseSeed))throw new Error('--seed must be an integer');
  if(!Number.isInteger(options.stepLimit)||options.stepLimit<1)throw new Error('--step-limit must be a positive integer');
  return options;
}
```

- [ ] **Step 4: Implement simulation CLI main and import guard**

Use built-ins:

```js
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runSimulationBatch } from '../src/simulation/driver.js';

async function main(){
  let options;
  try{options=parseSimulationArgs(process.argv.slice(2));}
  catch(error){console.error(error.message);process.exitCode=2;return;}

  const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  const result=runSimulationBatch({
    matches:options.matches,
    baseSeed:options.baseSeed,
    stepLimit:options.stepLimit,
    engineVersion:pkg.version,
    gitSha:process.env.GITHUB_SHA||null,
  });

  if(result.ok){
    if(!options.quiet)console.log(`Simulation OK: matches=${result.matches} steps=${result.steps} seed=${options.baseSeed}..${options.baseSeed+options.matches-1}`);
    return;
  }

  await mkdir(options.outDir,{recursive:true});
  const filename=join(options.outDir,`failure-seed-${result.seed}.json`);
  await writeFile(filename,JSON.stringify(result.result.replay,null,2)+'\n','utf8');
  console.error(`Invariant failed: ${result.result.replay.failure?.code||'SIMULATION_ERROR'}`);
  console.error(`seed=${result.seed} match=${result.matchIndex+1} round=${result.result.replay.failure?.round} step=${result.result.steps}`);
  console.error(`replay=${filename}`);
  process.exitCode=1;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
```

- [ ] **Step 5: Implement replay CLI**

Create `scripts/replay.mjs`:

```js
import { readFile } from 'node:fs/promises';
import { replayDeterministicMatch } from '../src/simulation/driver.js';

const [filename,...extra]=process.argv.slice(2);
if(!filename||extra.length){
  console.error('Usage: npm run replay -- <replay.json>');
  process.exitCode=2;
}else{
  try{
    const replay=JSON.parse(await readFile(filename,'utf8'));
    const result=replayDeterministicMatch(replay);
    if(result.ok)console.log(`Replay OK: seed=${replay.seed} steps=${result.step} final=${result.finalSummary}`);
    else{
      console.error(`Replay diverged at step ${result.step}: expected=${result.expected} actual=${result.actual}`);
      process.exitCode=1;
    }
  }catch(error){
    console.error(error.stack||error.message);
    process.exitCode=1;
  }
}
```

- [ ] **Step 6: Add package scripts and ignored replay directory**

Add to `package.json` scripts:

```json
"test:sim": "node scripts/simulate.mjs --matches 100 --seed 1 --quiet",
"sim": "node scripts/simulate.mjs",
"replay": "node scripts/replay.mjs"
```

Append to `.gitignore`:

```text
artifacts/replays/
```

- [ ] **Step 7: Verify CLI and commit**

Run:

```bash
node --test tests/simulation-driver.test.mjs
npm run sim -- --matches 10 --seed 1
npm run test:sim
```

Expected: all exit 0.

Then:

```bash
git add scripts/simulate.mjs scripts/replay.mjs package.json .gitignore tests/simulation-driver.test.mjs
git commit -m "feat: add simulation and replay CLI"
```

---

### Task 7: CI, documentation, full verification and PR

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`

**Interfaces:**
- CI order: install => unit tests => deterministic 100-match simulation => Chromium install => Playwright => screenshot upload.
- README commands exactly match `package.json`.

- [ ] **Step 1: Add simulation smoke to CI**

Insert after `npm test`:

```yaml
      - run: npm run test:sim
```

Leave Playwright steps unchanged.

- [ ] **Step 2: Add README developer section**

Add this section:

````markdown
## Testy deterministyczne i replay

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
````

- [ ] **Step 3: Run unit + deterministic stress verification**

Run:

```bash
npm test
npm run test:sim
npm run sim -- --matches 1000 --seed 1 --quiet
```

Expected: all exit 0. Record wall-clock duration of `npm run test:sim` in the PR description.

- [ ] **Step 4: Run full Playwright suite**

Run:

```bash
npm run test:e2e
```

Expected: all existing desktop/phone cases pass with only pre-existing breakpoint-specific skips.

- [ ] **Step 5: Verify production code does not import developer replay/driver modules**

Run:

```bash
grep -R "simulation/replay\|simulation/driver\|artifacts/replays" index.html src/ui*.js src/multiplayer.js || true
```

Expected: no matches.

- [ ] **Step 6: Verify replay artifacts are ignored**

Run:

```bash
git status --short --ignored artifacts/replays
```

Expected: generated replay files, when present, are shown with `!!` and are not tracked.

- [ ] **Step 7: Commit CI/docs**

```bash
git add .github/workflows/ci.yml README.md
git commit -m "ci: run deterministic Tichu match simulations"
```

- [ ] **Step 8: Final verification before PR**

Run:

```bash
npm test && npm run test:sim && npm run test:e2e
git status --short
```

Expected: test commands PASS and working tree is clean except ignored replay artifacts.

- [ ] **Step 9: Open PR with evidence**

PR body must include:

- deterministic seeded RNG and timer-free simulation seam;
- shared bot decision helpers and confirmation that no second rules engine was added;
- invariant categories and transition-aware exchange/scoring checks;
- replay format `tichu-dev-replay-v1` and replay CLI;
- exact unit-test count, 100-match CI result, 1,000-match stress result, and Playwright result;
- seed range used by the final stress run (`1..1000` unless a different explicit range was tested);
- every real engine defect found during stress testing, with its failing seed and targeted regression test.
