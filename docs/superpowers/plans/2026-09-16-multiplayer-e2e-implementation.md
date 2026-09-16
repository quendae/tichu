# Tichu Multiplayer E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production-backed multiplayer E2E coverage for Tichu using `api.qqnd.fyi`, with two human browser sessions plus two server bots in CI, reconnect coverage in CI, and four-human/bot-takeover coverage as an explicit full smoke.

**Architecture:** The QQND server remains authoritative. First synchronize its Tichu state model with the client by preserving Dog in a non-scoring `discarded` pile and deploy that change. Then add a test-only bridge to the browser client, enabled only by `?e2e=1`, and drive real private rooms on `wss://api.qqnd.fyi/api/v1/ws` from isolated Playwright contexts. Lobby/start flows remain UI-driven; gameplay actions use the same `MultiplayerClient.action()` path as the UI while reading only each viewer's already-redacted state.

**Tech Stack:** Node.js 22 for `quendae/tichu`, Node.js 24 for `quendae/qqnd-game-server`, ES modules, Playwright 1.55+, native `node:test`, TypeScript 7, Fastify, `ws`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-16-multiplayer-e2e-design.md`

## Global Constraints

- Live integration target is exactly `wss://api.qqnd.fyi/api/v1/ws`.
- Live tests create only private rooms and unique `E2E-*` identities.
- Live tests never inspect or print resume tokens or another player's real hand.
- The E2E bridge exists only when the page query contains `e2e=1`.
- Lobby creation, joining, room-code entry, bot-fill selection and game start are exercised through the real UI.
- Gameplay actions sent by the bridge must call the existing `MultiplayerClient.action()` path; no direct server mutation or second protocol client in the browser test.
- Server-side Dog is preserved in `discarded`, which is public, non-scoring state.
- Default live CI is 2 humans + 2 server bots and includes transient reconnect.
- Default live CI must not wait for the server's 60-second substitute-bot grace period.
- Bot takeover and four-human/no-bot coverage run through the explicit full-smoke command.
- Existing offline unit, deterministic simulation, and visual Playwright suites remain unchanged in purpose and must stay green.
- Server deployment must precede enabling Dog-schema-dependent production E2E assertions.
- Cleanup errors are diagnostic only and must not replace the first substantive test failure.

---

## File Map

### `quendae/qqnd-game-server` — branch `feature/tichu-multiplayer-e2e-support`

- Modify `src/games/tichu/engine.ts` — add `discarded` to authoritative Tichu state, reset it each round, preserve Dog there.
- Modify `test/tichu-engine.test.ts` — regression for Dog card conservation and seat-view visibility.
- No protocol schema change is required: `game.state` already carries game-specific state as `unknown`.

### `quendae/tichu` — branch `feature/multiplayer-e2e`

- Create `src/e2e-bridge.js` — safe test-only bridge over `game` and `MultiplayerClient`.
- Modify `src/ui.js` — dynamically install the bridge only for `?e2e=1`.
- Create `tests/e2e-bridge.test.mjs` — pure bridge safety tests.
- Create `tests/e2e/e2e-bridge.spec.mjs` — browser proof that normal navigation has no bridge and E2E navigation does.
- Create `playwright.multiplayer.config.mjs` — serial desktop-only configuration for live production tests.
- Create `tests/e2e-multiplayer/helpers.mjs` — isolated contexts, UI room lifecycle, safe state canonicalization, legal human-action driver and cleanup.
- Create `tests/e2e-multiplayer/live-2h2b.spec.mjs` — CI path: private room, 2 humans + 2 bots, Grand, exchange, play, completed trick, redaction and reconnect.
- Create `tests/e2e-multiplayer/full-4h.spec.mjs` — manual four-human/no-bot smoke.
- Create `tests/e2e-multiplayer/takeover.spec.mjs` — manual substitute-bot smoke across the 60-second production grace period.
- Modify `package.json` — live multiplayer scripts.
- Modify `.github/workflows/ci.yml` — add bounded live multiplayer CI and diagnostics upload.
- Modify `README.md` — document live-vs-offline commands, production-room behavior and full smoke.

---

### Task 1: Fix Dog conservation in the authoritative QQND Tichu engine

**Repository:** `quendae/qqnd-game-server`

**Files:**
- Modify: `src/games/tichu/engine.ts`
- Modify: `test/tichu-engine.test.ts`

**Interfaces:**
- Consumes: existing `TichuState`, `createTichuGame()`, `reduceTichuAction()`, `tichuStateForSeat()`.
- Produces: `TichuState.discarded: TichuCard[]`; seat views retain this public pile unchanged.

- [ ] **Step 1: Write the failing Dog-conservation test**

Append a focused test to `test/tichu-engine.test.ts`. Build a normal game through Grand and exchange, identify the seat that owns Dog, force that seat to lead a fresh trick, then count all live card identities after the Dog play.

```ts
function allLiveCardIds(state: ReturnType<typeof createTichuGame>): string[] {
  return [
    ...state.hands.flat(),
    ...state.captured.flat(),
    ...state.table.flatMap((entry) => entry.cards),
    ...state.remainingDeck,
    ...(state.discarded ?? []),
  ].map((card) => card.id);
}

function completeGrandAndExchange(state: ReturnType<typeof createTichuGame>) {
  let next = state;
  for (let seat = 0; seat < 4; seat += 1) {
    next = reduceTichuAction(next, seat, "grand", { call: false }).state;
  }
  for (let seat = 0; seat < 4; seat += 1) {
    const hand = next.hands[seat];
    const targets = [0, 1, 2, 3].filter((target) => target !== seat);
    next = reduceTichuAction(next, seat, "exchange", {
      map: Object.fromEntries(targets.map((target, index) => [target, hand[index]!.id])),
    }).state;
  }
  return next;
}

test("Dog remains accounted for after passing the lead", () => {
  let state = completeGrandAndExchange(createTichuGame(["A", "B", "C", "D"]));
  const dogSeat = state.hands.findIndex((hand) => hand.some((card) => card.special === "dog"));
  assert.notEqual(dogSeat, -1);
  const dog = state.hands[dogSeat]!.find((card) => card.special === "dog")!;

  state.currentPlayer = dogSeat;
  state.trickLeader = dogSeat;
  state.table = [];
  state.lastPlay = null;
  state.passes = 0;

  state = reduceTichuAction(state, dogSeat, "play", { ids: [dog.id] }).state;
  const ids = allLiveCardIds(state);

  assert.equal(ids.length, 56);
  assert.equal(new Set(ids).size, 56);
  assert.deepEqual(state.discarded.map((card) => card.id), ["dog"]);
  assert.equal(state.table.length, 0);
  assert.equal(state.lastPlay, null);
  assert.equal(state.currentPlayer, (dogSeat + 2) % 4);
});
```

- [ ] **Step 2: Run the focused server test and verify RED**

Run from `quendae/qqnd-game-server`:

```bash
npm test -- --test-name-pattern="Dog remains accounted"
```

Expected: FAIL because `discarded` does not exist and the live-card count after Dog is 55.

- [ ] **Step 3: Add `discarded` to the authoritative state model**

In `TichuState` add:

```ts
  discarded: TichuCard[];
```

In `initialState()` initialize:

```ts
    discarded: [],
```

In `dealRound()` reset:

```ts
  state.discarded = [];
```

- [ ] **Step 4: Preserve Dog before clearing the temporary table**

In the Dog branch inside `reduceTichuAction(..., "play", ...)`, change the branch to:

```ts
    if (firstCard.special === "dog") {
      state.discarded.push(...cards);
      state.table = [];
      state.lastPlay = null;
      state.passes = 0;
      let partner = (seat + 2) % 4;
      if (state.finished.includes(partner)) partner = nextActive(state, partner);
      state.currentPlayer = partner;
      state.trickLeader = partner;
    } else {
      state.currentPlayer = nextActive(state, seat);
    }
```

Do not add `discarded` to scoring.

- [ ] **Step 5: Add seat-view regression coverage**

Append:

```ts
test("tichu seat views preserve the public discarded pile", () => {
  const state = createTichuGame(["A", "B", "C", "D"]);
  state.discarded = [{ id: "dog", suit: null, rank: 0, special: "dog" }];
  const view = tichuStateForSeat(state, 3);
  assert.deepEqual(view.discarded.map((card) => card.id), ["dog"]);
});
```

Expected behavior: `tichuStateForSeat()` already clones the state and therefore requires no special redaction logic for this public pile.

- [ ] **Step 6: Run focused tests and full server verification**

```bash
npm test -- --test-name-pattern="Dog remains accounted|discarded pile"
npm run typecheck
npm test
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit the server fix**

```bash
git add src/games/tichu/engine.ts test/tichu-engine.test.ts
git commit -m "fix: preserve Tichu Dog in authoritative state"
```

---

### Task 2: Merge/deploy the server prerequisite and verify production schema

**Repository:** `quendae/qqnd-game-server`

**Files:**
- No source changes beyond Task 1.
- Operational target: systemd service `qqnd-game-server.service` with `WorkingDirectory=/opt/qqnd-game-server`.

**Interfaces:**
- Produces: production `game.state.state.discarded` array at `wss://api.qqnd.fyi/api/v1/ws`.
- Gate for: all subsequent client live E2E tasks.

- [ ] **Step 1: Push the server branch and open a PR**

```bash
git push -u origin feature/tichu-multiplayer-e2e-support
```

Open a PR to `main` titled:

```text
Preserve Tichu Dog in authoritative state
```

PR body must report the focused Dog regression plus `typecheck`, `npm test`, and `npm run build` results.

- [ ] **Step 2: Wait for QQND server CI and inspect failures before merge**

Required CI commands are:

```text
npm run typecheck
npm test
npm run build
```

Do not merge on a red check.

- [ ] **Step 3: Merge the server PR only after explicit integration approval**

Use squash merge and capture the resulting `main` SHA. Do not infer that deployment happened merely because GitHub merged.

- [ ] **Step 4: Deploy the merged server revision to the LXC**

Using the existing server-management path for the host, execute the equivalent of:

```bash
cd /opt/qqnd-game-server
git fetch origin
git checkout main
git pull --ff-only origin main
npm ci
npm run typecheck
npm test
npm run build
sudo systemctl restart qqnd-game-server
sudo systemctl --no-pager --full status qqnd-game-server
```

Expected: build/tests succeed and systemd reports the service active/running.

- [ ] **Step 5: Verify the public health endpoint after restart**

```bash
curl -fsS https://api.qqnd.fyi/api/v1/health
```

Expected: JSON with `"ok": true` and `"service": "qqnd-game-server"`.

- [ ] **Step 6: Keep a production-schema gate in the first client live test**

Do not create a separate hidden/debug endpoint. The first real `game.state` received by the browser test in Task 4 must assert:

```js
expect(Array.isArray(state.discarded)).toBe(true);
```

If this fails, treat it as "new server code is not deployed" and stop client rollout rather than weakening the assertion.

---

### Task 3: Add a safe test-only browser bridge

**Repository:** `quendae/tichu`

**Files:**
- Create: `src/e2e-bridge.js`
- Modify: `src/ui.js`
- Create: `tests/e2e-bridge.test.mjs`
- Create: `tests/e2e/e2e-bridge.spec.mjs`

**Interfaces:**
- Produces: `createTichuE2EBridge(game, mp)` and `installTichuE2EBridge({ game, mp, target })`.
- Browser surface only in E2E mode: `window.__tichuE2E`.
- `getMultiplayerStatus()` returns only `{ active, authoritative, roomId, seat, stateSeq, botSeats, presence }`; it never returns session/resume credentials.

- [ ] **Step 1: Write RED unit tests for bridge safety**

Create `tests/e2e-bridge.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTichuE2EBridge, isE2EMode } from '../src/e2e-bridge.js';

test('isE2EMode requires e2e=1 exactly',()=>{
  assert.equal(isE2EMode('?e2e=1'),true);
  assert.equal(isE2EMode('?e2e=true'),false);
  assert.equal(isE2EMode(''),false);
});

test('E2E bridge omits session and resume credentials',()=>{
  const game={state:{phase:'grand',hands:[[{id:'a'}],[{id:'hidden-1',hidden:true}],[],[]],selected:new Set(['a'])}};
  const mp={
    active:true,authoritative:true,room:{id:'TEST-ROOM'},seat:2,stateSeq:7,botSeats:[1,3],presence:[],
    session:{id:'secret-session'},resumeToken:'secret-token',
    action:async()=>true,socket:null,
  };
  const bridge=createTichuE2EBridge(game,mp);
  const status=bridge.getMultiplayerStatus();
  assert.equal(status.roomId,'TEST-ROOM');
  assert.equal('session' in status,false);
  assert.equal('resumeToken' in status,false);
  assert.deepEqual(bridge.getState().selected,['a']);
});

test('E2E bridge delegates actions to MultiplayerClient.action',async()=>{
  const calls=[];
  const game={state:{}};
  const mp={action:async(...args)=>{calls.push(args);return true},active:true,authoritative:true,room:null,seat:0,stateSeq:0,botSeats:[],presence:[]};
  const bridge=createTichuE2EBridge(game,mp);
  await bridge.action('grand',{call:false});
  assert.deepEqual(calls,[['grand',{call:false}]]);
});
```

- [ ] **Step 2: Run the unit test and verify RED**

```bash
node --test tests/e2e-bridge.test.mjs
```

Expected: FAIL because `src/e2e-bridge.js` does not exist.

- [ ] **Step 3: Implement `src/e2e-bridge.js`**

Create:

```js
const cloneForTest=value=>JSON.parse(JSON.stringify(value,(_key,item)=>item instanceof Set?[...item]:item));

export function isE2EMode(search=globalThis.location?.search||''){
  return new URLSearchParams(search).get('e2e')==='1';
}

export function createTichuE2EBridge(game,mp){
  return Object.freeze({
    getState:()=>cloneForTest(game.state),
    getMultiplayerStatus:()=>cloneForTest({
      active:!!mp.active,
      authoritative:!!mp.authoritative,
      roomId:mp.room?.id||null,
      seat:Number.isInteger(mp.seat)?mp.seat:null,
      stateSeq:Number(mp.stateSeq||0),
      botSeats:[...(mp.botSeats||[])],
      presence:[...(mp.presence||[])],
    }),
    action:(type,payload={})=>mp.action(type,payload),
    closeSocket:()=>{
      if(!mp.socket)return false;
      mp.socket.close(4000,'e2e_disconnect');
      return true;
    },
    waitForRevision:(minimum,timeoutMs=12_000)=>new Promise((resolve,reject)=>{
      const deadline=Date.now()+timeoutMs;
      const poll=()=>{
        if(Number(mp.stateSeq||0)>=minimum)return resolve(Number(mp.stateSeq||0));
        if(Date.now()>=deadline)return reject(new Error(`revision_timeout:${minimum}`));
        setTimeout(poll,25);
      };
      poll();
    }),
  });
}

export function installTichuE2EBridge({game,mp,target=globalThis}){
  if(!target||target.__tichuE2E)return target?.__tichuE2E;
  const bridge=createTichuE2EBridge(game,mp);
  Object.defineProperty(target,'__tichuE2E',{value:bridge,configurable:true});
  return bridge;
}
```

- [ ] **Step 4: Install the bridge dynamically only in E2E mode**

At the end of `src/ui.js`, after `window.tichu={game,mp,uiState};`, add:

```js
if(new URLSearchParams(location.search).get('e2e')==='1'){
  import('./e2e-bridge.js').then(({installTichuE2EBridge})=>installTichuE2EBridge({game,mp}));
}
```

Do not statically import the bridge.

- [ ] **Step 5: Run bridge unit tests GREEN**

```bash
node --test tests/e2e-bridge.test.mjs
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Add browser-level bridge gating test**

Create `tests/e2e/e2e-bridge.spec.mjs`:

```js
import {test,expect} from '@playwright/test';

test('E2E bridge is absent during normal navigation',async({page})=>{
  await page.goto('/');
  await expect.poll(()=>page.evaluate(()=>typeof window.__tichuE2E)).toBe('undefined');
});

test('E2E bridge is available only with e2e=1',async({page})=>{
  await page.goto('/?e2e=1');
  await expect.poll(()=>page.evaluate(()=>typeof window.__tichuE2E)).toBe('object');
  const status=await page.evaluate(()=>window.__tichuE2E.getMultiplayerStatus());
  expect(status).not.toHaveProperty('resumeToken');
  expect(status).not.toHaveProperty('session');
});
```

- [ ] **Step 7: Run the focused browser tests**

```bash
npx playwright test tests/e2e/e2e-bridge.spec.mjs --project=desktop-1440
```

Expected: 2 passed.

- [ ] **Step 8: Commit the bridge**

```bash
git add src/e2e-bridge.js src/ui.js tests/e2e-bridge.test.mjs tests/e2e/e2e-bridge.spec.mjs
git commit -m "test: add safe Tichu multiplayer E2E bridge"
```

---

### Task 4: Add the production 2-human + 2-bot CI scenario with reconnect

**Repository:** `quendae/tichu`

**Files:**
- Create: `playwright.multiplayer.config.mjs`
- Create: `tests/e2e-multiplayer/helpers.mjs`
- Create: `tests/e2e-multiplayer/live-2h2b.spec.mjs`
- Modify: `package.json`

**Interfaces:**
- `openE2EClient(browser, baseURL, label, testInfo)` returns `{ context, page, label }`.
- `bridgeState(client)` returns the viewer-redacted state.
- `bridgeStatus(client)` returns safe multiplayer metadata.
- `canonicalPublicSummary(state,status)` maps seat-relative views back to actual seat coordinates.
- `driveHumanDecision(client)` sends at most one legal human action and returns `{ acted, type }`.
- `cleanupClients(clients)` attempts normal `room.leave`, then closes contexts without replacing the primary failure.

- [ ] **Step 1: Create serial live Playwright configuration**

Create `playwright.multiplayer.config.mjs`:

```js
import {defineConfig,devices} from '@playwright/test';

const baseURL=`http://127.0.0.1:${process.env.PORT||8080}`;

export default defineConfig({
  testDir:'./tests/e2e-multiplayer',
  timeout:120_000,
  expect:{timeout:15_000},
  fullyParallel:false,
  workers:1,
  retries:process.env.CI?1:0,
  reporter:'line',
  outputDir:'test-results-multiplayer',
  use:{baseURL,trace:'retain-on-failure',screenshot:'only-on-failure',video:'retain-on-failure'},
  webServer:{command:'npm run serve',url:baseURL,reuseExistingServer:false,timeout:20_000},
  projects:[{name:'live-desktop',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:900}}}],
});
```

- [ ] **Step 2: Write helpers with real UI room lifecycle**

Create `tests/e2e-multiplayer/helpers.mjs` with imports:

```js
import {expect} from '@playwright/test';
import {possibleSelections} from '../../src/rules.js';
```

Implement unique labels without external dependencies:

```js
export function runTag(testInfo){
  const run=process.env.GITHUB_RUN_ID||process.pid;
  const retry=testInfo?.retry??0;
  return `${run}-${retry}-${Math.random().toString(36).slice(2,7)}`;
}

export async function openE2EClient(browser,baseURL,label,testInfo){
  const context=await browser.newContext();
  const page=await context.newPage();
  const errors=[];
  page.on('console',message=>{if(message.type()==='error')errors.push(`console:${message.text()}`)});
  page.on('pageerror',error=>errors.push(`page:${error.message}`));
  await page.goto(`${baseURL}/?e2e=1`);
  await expect.poll(()=>page.evaluate(()=>typeof window.__tichuE2E)).toBe('object');
  return {context,page,label,errors,testInfo};
}
```

Add UI helpers using the existing DOM IDs:

```js
export async function openMultiplayer(client){
  await client.page.locator('#game-menu-button').click();
  await client.page.locator('[data-action="open-multiplayer"]').click();
  await expect(client.page.locator('#mp-modal')).toBeVisible();
}

export async function createPrivateRoom(client,nickname){
  await openMultiplayer(client);
  await client.page.locator('#mp-nick').fill(nickname);
  await client.page.locator('#mp-vis').selectOption('private');
  await client.page.locator('#mp-create').click();
  await expect(client.page.locator('#mp-room')).toBeVisible();
  return (await client.page.locator('#mp-room-code').textContent()).trim();
}

export async function joinPrivateRoom(client,nickname,roomId){
  await openMultiplayer(client);
  await client.page.locator('#mp-nick').fill(nickname);
  await client.page.locator('#mp-code').fill(roomId);
  await client.page.locator('#mp-join').click();
  await expect(client.page.locator('#mp-room-code')).toHaveText(roomId);
}

export async function startWithBots(host){
  await host.page.locator('#mp-bots').check();
  await expect(host.page.locator('#mp-start')).toBeEnabled();
  await host.page.locator('#mp-start').click();
  await expect.poll(()=>host.page.evaluate(()=>window.__tichuE2E.getMultiplayerStatus().active)).toBe(true);
}
```

- [ ] **Step 3: Add safe bridge/state helpers and canonical public comparison**

Add:

```js
export const bridgeState=client=>client.page.evaluate(()=>window.__tichuE2E.getState());
export const bridgeStatus=client=>client.page.evaluate(()=>window.__tichuE2E.getMultiplayerStatus());

const actualSeat=(local,viewer)=>(viewer+local)%4;

export function canonicalPublicSummary(state,status){
  const viewer=status.seat;
  const canonicalScores=viewer%2===1?[state.scores[1],state.scores[0]]:[...state.scores];
  return {
    phase:state.phase,
    round:state.round,
    scores:canonicalScores,
    currentPlayer:actualSeat(state.currentPlayer,viewer),
    trickLeader:actualSeat(state.trickLeader,viewer),
    finished:(state.finished||[]).map(seat=>actualSeat(seat,viewer)),
    wish:state.wish,
    table:(state.table||[]).map(entry=>({seat:actualSeat(entry.seat,viewer),cards:entry.cards.map(card=>card.id)})),
    discarded:(state.discarded||[]).map(card=>card.id),
  };
}

export function assertPrivateHands(state){
  expect(state.hands[0].some(card=>card.hidden)).toBe(false);
  for(let seat=1;seat<4;seat++)expect(state.hands[seat].every(card=>card.hidden===true)).toBe(true);
}
```

- [ ] **Step 4: Add one-action legal human driver**

Add:

```js
function exchangePayload(state){
  const ids=state.hands[0].slice(0,3).map(card=>card.id);
  if(ids.length!==3||new Set(ids).size!==3)throw new Error('insufficient_exchange_cards');
  return {map:{1:ids[0],2:ids[1],3:ids[2]}};
}

export async function driveHumanDecision(client){
  const state=await bridgeState(client);
  if(state.phase==='grand'&&!state.declarations[0]){
    await client.page.evaluate(()=>window.__tichuE2E.action('grand',{call:false}));
    return {acted:true,type:'grand'};
  }
  if(state.phase==='exchange'&&!state.exchangeDone[0]){
    const payload=exchangePayload(state);
    await client.page.evaluate(payload=>window.__tichuE2E.action('exchange',payload),payload);
    return {acted:true,type:'exchange'};
  }
  if(state.phase==='play'&&state.dragonRecipient==='needed'){
    const winner=state.table.at(-1)?.seat;
    if(winner===0){
      await client.page.evaluate(()=>window.__tichuE2E.action('dragon',{seat:1}));
      return {acted:true,type:'dragon'};
    }
    return {acted:false,type:null};
  }
  if(state.phase!=='play'||state.currentPlayer!==0)return {acted:false,type:null};

  let options=possibleSelections(state.hands[0],state.lastPlay,state.wish);
  if(state.wish&&options.some(option=>option.fulfills))options=options.filter(option=>option.fulfills);
  const chosen=options.find(option=>option.play.type!=='bomb')||options[0];
  if(!chosen){
    if(!state.lastPlay)return {acted:false,type:null};
    await client.page.evaluate(()=>window.__tichuE2E.action('pass',{}));
    return {acted:true,type:'pass'};
  }
  const payload={
    ids:chosen.cards.map(card=>card.id),
    wishRank:chosen.cards.some(card=>card.special==='mahjong')?14:null,
  };
  await client.page.evaluate(payload=>window.__tichuE2E.action('play',payload),payload);
  return {acted:true,type:'play'};
}
```

- [ ] **Step 5: Add revision synchronization and cleanup helpers**

Add:

```js
export async function waitForSameRevision(clients,minimum=1){
  await expect.poll(async()=>{
    const statuses=await Promise.all(clients.map(bridgeStatus));
    const revisions=statuses.map(status=>status.stateSeq);
    return revisions.every(revision=>revision>=minimum)&&new Set(revisions).size===1?revisions[0]:0;
  },{timeout:15_000}).toBeGreaterThanOrEqual(minimum);
}

export async function cleanupClients(clients){
  const errors=[];
  for(const client of clients){
    try{
      await client.page.evaluate(async()=>{
        const mp=window.tichu?.mp;
        if(mp?.room)await mp.leave();
      });
    }catch(error){errors.push(`${client.label}:${error.message}`)}
  }
  for(const client of clients){
    try{await client.context.close()}catch(error){errors.push(`${client.label}:close:${error.message}`)}
  }
  return errors;
}
```

- [ ] **Step 6: Write the live 2H+2B test**

Create `tests/e2e-multiplayer/live-2h2b.spec.mjs`:

```js
import {test,expect} from '@playwright/test';
import {
  assertPrivateHands,bridgeState,bridgeStatus,canonicalPublicSummary,cleanupClients,
  createPrivateRoom,driveHumanDecision,joinPrivateRoom,openE2EClient,runTag,startWithBots,waitForSameRevision,
} from './helpers.mjs';

test('production QQND: 2 humans + 2 bots synchronize, redact hands and reconnect',async({browser,baseURL},testInfo)=>{
  const tag=runTag(testInfo),clients=[];
  let primaryError=null,roomId=null;
  try{
    const h1=await openE2EClient(browser,baseURL,'H1',testInfo);clients.push(h1);
    const h2=await openE2EClient(browser,baseURL,'H2',testInfo);clients.push(h2);
    roomId=await createPrivateRoom(h1,`E2E-${tag}-H1`);
    await joinPrivateRoom(h2,`E2E-${tag}-H2`,roomId);
    await startWithBots(h1);
    await expect.poll(()=>bridgeStatus(h2).then(status=>status.active)).toBe(true);

    const initial=[await bridgeState(h1),await bridgeState(h2)];
    expect(Array.isArray(initial[0].discarded)).toBe(true);
    expect(Array.isArray(initial[1].discarded)).toBe(true);
    initial.forEach(assertPrivateHands);

    let completedTricks=0,actions=0,previous=initial[0];
    const deadline=Date.now()+45_000;
    while(Date.now()<deadline&&completedTricks<1){
      let acted=false;
      for(const client of [h1,h2]){
        const result=await driveHumanDecision(client);
        if(result.acted){acted=true;actions+=1;break}
      }
      await new Promise(resolve=>setTimeout(resolve,acted?100:250));
      const current=await bridgeState(h1);
      if(previous.table?.length>0&&current.table?.length===0&&current.lastPlay===null&&
         (current.discarded?.length||0)===(previous.discarded?.length||0))completedTricks+=1;
      previous=current;
    }
    expect(actions).toBeGreaterThanOrEqual(4);
    expect(completedTricks).toBeGreaterThanOrEqual(1);

    const revision=await waitForSameRevision([h1,h2]);
    const beforeStatus=await bridgeStatus(h2);
    expect(beforeStatus.roomId).toBe(roomId);
    await h2.page.evaluate(()=>window.__tichuE2E.closeSocket());
    await expect.poll(()=>bridgeStatus(h2).then(status=>status.roomId),{timeout:20_000}).toBe(roomId);
    await expect.poll(()=>bridgeStatus(h2).then(status=>status.stateSeq),{timeout:20_000}).toBeGreaterThanOrEqual(revision);

    const [s1,s2]=await Promise.all([bridgeState(h1),bridgeState(h2)]);
    const [m1,m2]=await Promise.all([bridgeStatus(h1),bridgeStatus(h2)]);
    expect(canonicalPublicSummary(s1,m1)).toEqual(canonicalPublicSummary(s2,m2));
    assertPrivateHands(s1);assertPrivateHands(s2);
  }catch(error){primaryError=error;throw error}
  finally{
    const cleanupErrors=await cleanupClients(clients);
    if(cleanupErrors.length)testInfo.attach('cleanup-errors',{body:cleanupErrors.join('\n'),contentType:'text/plain'});
    if(primaryError)testInfo.attach('room-id',{body:String(roomId||'not-created'),contentType:'text/plain'});
  }
});
```

- [ ] **Step 7: Add the npm script**

Modify `package.json` scripts:

```json
"test:e2e:multiplayer": "playwright test -c playwright.multiplayer.config.mjs tests/e2e-multiplayer/live-2h2b.spec.mjs"
```

- [ ] **Step 8: Run RED/GREEN against production deliberately**

Before Task 2 deployment, the schema assertion is expected to fail if production still lacks `discarded`.

After deployment, run:

```bash
npm run test:e2e:multiplayer
```

Expected after deployment: 1 passed, with a unique private room and no hidden-hand leak.

- [ ] **Step 9: Commit the default live scenario**

```bash
git add playwright.multiplayer.config.mjs tests/e2e-multiplayer/helpers.mjs tests/e2e-multiplayer/live-2h2b.spec.mjs package.json
git commit -m "test: add production Tichu multiplayer E2E"
```

---

### Task 5: Add explicit four-human and 60-second bot-takeover smoke tests

**Repository:** `quendae/tichu`

**Files:**
- Create: `tests/e2e-multiplayer/full-4h.spec.mjs`
- Create: `tests/e2e-multiplayer/takeover.spec.mjs`
- Modify: `package.json`

**Interfaces:**
- Reuses all helpers from Task 4.
- Produces manual command `npm run test:e2e:multiplayer:full`.

- [ ] **Step 1: Add helper for a four-human lobby**

Extend `helpers.mjs`:

```js
export async function startWithoutBots(host){
  await host.page.locator('#mp-bots').uncheck();
  await expect(host.page.locator('#mp-start')).toBeEnabled();
  await host.page.locator('#mp-start').click();
  await expect.poll(()=>bridgeStatus(host).then(status=>status.active)).toBe(true);
}
```

- [ ] **Step 2: Write the four-human smoke**

Create `full-4h.spec.mjs`. The test must create four independent contexts, join one private room, start with `botCount=0`, and drive all human decisions until Grand + exchange complete and at least six play/pass actions synchronize.

Core loop:

```js
const clients=[h1,h2,h3,h4];
for(const client of clients)assertPrivateHands(await bridgeState(client));

let playActions=0;
const deadline=Date.now()+60_000;
while(Date.now()<deadline&&playActions<6){
  for(const client of clients){
    const result=await driveHumanDecision(client);
    if(result.acted&&['play','pass','dragon'].includes(result.type))playActions+=1;
  }
  await new Promise(resolve=>setTimeout(resolve,100));
}
expect(playActions).toBeGreaterThanOrEqual(6);
const summaries=await Promise.all(clients.map(async client=>canonicalPublicSummary(await bridgeState(client),await bridgeStatus(client))));
for(const summary of summaries.slice(1))expect(summary).toEqual(summaries[0]);
```

Use the same `try/finally` cleanup discipline as the default test.

- [ ] **Step 3: Write the 60-second takeover smoke**

Create `takeover.spec.mjs`. Start 2 humans + 2 bots, capture H2's actual `seat`, close H2's entire browser context so it cannot auto-resume, then wait up to 75 seconds for H1 to observe that seat as a substitute bot.

```js
const h2Status=await bridgeStatus(h2);
const disconnectedSeat=h2Status.seat;
await h2.context.close();
clients.splice(clients.indexOf(h2),1);

await expect.poll(async()=>{
  const status=await bridgeStatus(h1);
  return status.presence.some(entry=>entry.seat===disconnectedSeat&&entry.botActive===true);
},{timeout:75_000,interval:1_000}).toBe(true);

await expect.poll(()=>bridgeStatus(h1).then(status=>status.botSeats.includes(disconnectedSeat)),{timeout:5_000}).toBe(true);
```

Then call `driveHumanDecision(h1)` as needed and assert that `stateSeq` can advance after takeover. Do not shorten the server grace period in production solely to make this test faster.

- [ ] **Step 4: Add the manual full-smoke npm script**

Modify `package.json`:

```json
"test:e2e:multiplayer:full": "playwright test -c playwright.multiplayer.config.mjs tests/e2e-multiplayer/full-4h.spec.mjs tests/e2e-multiplayer/takeover.spec.mjs"
```

- [ ] **Step 5: Run the manual full smoke once and record measured runtime**

```bash
npm run test:e2e:multiplayer:full
```

Expected: both tests pass. Record the total and takeover-test durations in the eventual PR body. The takeover test should be roughly one reconnect-grace period plus setup, confirming why it is excluded from every-push CI.

- [ ] **Step 6: Commit full smoke coverage**

```bash
git add tests/e2e-multiplayer/helpers.mjs tests/e2e-multiplayer/full-4h.spec.mjs tests/e2e-multiplayer/takeover.spec.mjs package.json
git commit -m "test: add full Tichu multiplayer smoke"
```

---

### Task 6: Wire bounded production multiplayer coverage into CI and docs

**Repository:** `quendae/tichu`

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`

**Interfaces:**
- CI runs the bounded `test:e2e:multiplayer` only.
- Full 4H/takeover remains manual.

- [ ] **Step 1: Add live multiplayer test after the ordinary offline Playwright suite**

Modify `.github/workflows/ci.yml`:

```yaml
      - run: npm run test:e2e
      - name: Live multiplayer E2E
        run: npm run test:e2e:multiplayer
```

Do not add the full-smoke command to normal CI.

- [ ] **Step 2: Extend diagnostics artifact upload**

Replace the artifact paths with:

```yaml
      - name: Upload UI and multiplayer diagnostics
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: tichu-test-artifacts
          path: |
            test-results/*.png
            test-results-multiplayer/**
          if-no-files-found: ignore
```

This preserves traces/screenshots/video only on failure according to the Playwright configs.

- [ ] **Step 3: Document commands and production safety in README**

Add a section with exact commands:

```md
### Multiplayer E2E

The bounded multiplayer E2E uses the deployed QQND server at
`wss://api.qqnd.fyi/api/v1/ws`. It creates unique **private** rooms and two
isolated browser sessions; the remaining seats are server bots.

```bash
npm run test:e2e:multiplayer
```

The heavier four-human + bot-takeover smoke is manual because production
uses a 60-second disconnect grace period:

```bash
npm run test:e2e:multiplayer:full
```

The E2E bridge is available only with `?e2e=1` and exposes only the local
viewer's already-redacted state. Normal navigation does not install it.
```

Also state that failures may leave private rooms/sessions until normal server TTL cleanup, but tests never mutate rooms they did not create.

- [ ] **Step 4: Run config/docs-adjacent verification**

```bash
npm test
npx playwright test tests/e2e/e2e-bridge.spec.mjs --project=desktop-1440
npm run test:e2e:multiplayer
```

Expected: all commands pass.

- [ ] **Step 5: Commit CI/docs wiring**

```bash
git add .github/workflows/ci.yml README.md
git commit -m "ci: run bounded Tichu multiplayer E2E"
```

---

### Task 7: Final verification, review, and pull requests

**Repositories:** both.

**Files:**
- No new implementation files unless verification exposes a bug.

**Interfaces:**
- Produces two reviewable PRs with the server PR landed/deployed before the Tichu PR can claim live production success.

- [ ] **Step 1: Re-verify the exact server branch revision before its PR is integrated**

From `quendae/qqnd-game-server`:

```bash
npm run typecheck && npm test && npm run build
```

Expected: exit 0.

- [ ] **Step 2: Confirm deployed production health after the server merge/deploy**

```bash
curl -fsS https://api.qqnd.fyi/api/v1/health
```

Expected: `ok: true`.

Do not claim the `discarded` schema is deployed until Task 4's live browser test receives `state.discarded` as an array.

- [ ] **Step 3: Run the complete Tichu verification set on the final branch**

From `quendae/tichu`:

```bash
npm test
npm run test:sim
npm run test:e2e
npm run test:e2e:multiplayer
npm run test:e2e:multiplayer:full
```

Record exact pass counts, runtime, and any expected skips. Any failure must be debugged before opening the final client PR.

- [ ] **Step 4: Review the production boundary explicitly**

Search the final diff and verify:

```text
- `window.__tichuE2E` is installed only behind `e2e=1`.
- no resume token/session secret is returned by the bridge.
- live test logs/attachments contain no hidden opponent cards.
- normal multiplayer continues to use `MultiplayerClient.action()`.
- no test-only server endpoint or hidden-state API was added.
- only private E2E rooms are created.
```

- [ ] **Step 5: Open the Tichu PR only after live production verification is green**

PR title:

```text
Add production multiplayer E2E coverage
```

PR body must include:

```text
- deployed QQND server prerequisite commit/PR;
- exact production endpoint tested;
- offline unit/simulation/Playwright results;
- bounded 2H+2B live result and runtime;
- reconnect result;
- four-human result and runtime;
- 60-second takeover result and runtime;
- statement that all E2E rooms are private and uniquely named;
- statement that no hidden-hand/resume-token data is exposed by the test bridge.
```

- [ ] **Step 6: Wait for PR-triggered CI and inspect the live job separately**

A green prior push is not sufficient. Confirm the PR's own run has green results for:

```text
npm test
npm run test:sim
npm run test:e2e
npm run test:e2e:multiplayer
```

- [ ] **Step 7: Do not merge the Tichu PR without explicit user approval**

Report the PR URL, exact head SHA, CI run URL/status, live room-test outcome and full-smoke outcome. Keep `feature/multiplayer-e2e` available for review fixes.
