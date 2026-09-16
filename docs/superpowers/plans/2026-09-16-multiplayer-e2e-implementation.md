# Tichu Multiplayer E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production-backed multiplayer E2E coverage for Tichu using `api.qqnd.fyi`, with two human browser sessions plus two server bots in CI, reconnect coverage in CI, and four-human/bot-takeover coverage as an explicit full smoke.

**Architecture:** The QQND server stays authoritative. First preserve Dog in a public, non-scoring `discarded` pile on the server and deploy it. Then add a browser bridge available only with `?e2e=1`; lobby/start remain UI-driven while game actions call the existing `MultiplayerClient.action()` path. Every test action waits for the next authoritative revision before another action is attempted, so live tests do not depend on arbitrary network sleeps.

**Tech Stack:** Node.js 22 (`quendae/tichu`), Node.js 24 (`quendae/qqnd-game-server`), ES modules, Playwright 1.55+, native `node:test`, TypeScript 7, Fastify, `ws`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-16-multiplayer-e2e-design.md`

## Global Constraints

- Live WebSocket target: `wss://api.qqnd.fyi/api/v1/ws`.
- Live tests create only private rooms with unique `E2E-*` nicknames.
- No test logs, bridge method, or diagnostic attachment may reveal resume tokens or another player's real cards.
- `window.__tichuE2E` exists only when the URL contains `e2e=1`.
- Room creation/join/start and bot-fill controls are exercised through the real UI.
- Game actions use `MultiplayerClient.action()` and wait for authoritative revision advancement.
- Dog is retained in `discarded`; `discarded` never scores points.
- Default CI: 2 humans + 2 server bots, including reconnect.
- The production gateway's 60-second disconnect grace is excluded from every-push CI; takeover is manual/full smoke.
- Existing unit, deterministic simulation, and offline Playwright coverage stays green.
- Server fix/deployment precedes Dog-schema-dependent live E2E.
- Cleanup errors are secondary diagnostics only.
- Production `ALLOWED_ORIGINS` must permit `http://127.0.0.1:*` because Playwright serves the branch locally.

---

## Files

### `quendae/qqnd-game-server` — `feature/tichu-multiplayer-e2e-support`
- Modify `src/games/tichu/engine.ts`.
- Modify `test/tichu-engine.test.ts`.

### `quendae/tichu` — `feature/multiplayer-e2e`
- Create `src/e2e-bridge.js`.
- Modify `src/ui.js`.
- Create `tests/e2e-bridge.test.mjs`.
- Create `tests/e2e/e2e-bridge.spec.mjs`.
- Create `playwright.multiplayer.config.mjs`.
- Create `tests/e2e-multiplayer/helpers.mjs`.
- Create `tests/e2e-multiplayer/live-2h2b.spec.mjs`.
- Create `tests/e2e-multiplayer/full-4h.spec.mjs`.
- Create `tests/e2e-multiplayer/takeover.spec.mjs`.
- Modify `package.json`, `.github/workflows/ci.yml`, `README.md`.

---

### Task 1: Preserve Dog in the authoritative server state

**Repository:** `quendae/qqnd-game-server`

**Files:**
- Modify: `src/games/tichu/engine.ts`
- Modify: `test/tichu-engine.test.ts`

**Interfaces:**
- Add `TichuState.discarded: TichuCard[]`.
- `tichuStateForSeat()` leaves `discarded` visible because played Dog is public information.

- [ ] **Step 1: Add RED conservation test**

Append to `test/tichu-engine.test.ts`:

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
    const hand = next.hands[seat]!;
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

- [ ] **Step 2: Prove RED**

```bash
npx tsx --test --test-name-pattern="Dog remains accounted" test/tichu-engine.test.ts
```

Expected: FAIL; current state contains only 55 live card identities after Dog.

- [ ] **Step 3: Add/reset `discarded`**

In `TichuState`:

```ts
  discarded: TichuCard[];
```

In `initialState()`:

```ts
    captured: [[], [], [], []],
    discarded: [],
```

In `dealRound()`:

```ts
  state.captured = [[], [], [], []];
  state.discarded = [];
```

- [ ] **Step 4: Preserve Dog before clearing table**

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

- [ ] **Step 5: Add seat-view regression**

```ts
test("tichu seat views preserve the public discarded pile", () => {
  const state = createTichuGame(["A", "B", "C", "D"]);
  state.discarded = [{ id: "dog", suit: null, rank: 0, special: "dog" }];
  const view = tichuStateForSeat(state, 3);
  assert.deepEqual(view.discarded.map((card) => card.id), ["dog"]);
});
```

- [ ] **Step 6: Verify GREEN**

```bash
npx tsx --test --test-name-pattern="Dog remains accounted|discarded pile" test/tichu-engine.test.ts
npm run typecheck
npm test
npm run build
```

Expected: all exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/games/tichu/engine.ts test/tichu-engine.test.ts
git commit -m "fix: preserve Tichu Dog in authoritative state"
```

---

### Task 2: Integrate and deploy the server prerequisite

**Repository:** `quendae/qqnd-game-server`

**Files/Runtime:**
- `/etc/qqnd-game-server.env`
- `/opt/qqnd-game-server`
- systemd unit `qqnd-game-server.service`

**Produces:** deployed `discarded` schema and a localhost-compatible Origin policy.

- [ ] **Step 1: Push and open server PR**

```bash
git push -u origin feature/tichu-multiplayer-e2e-support
```

PR title:

```text
Preserve Tichu Dog in authoritative state
```

- [ ] **Step 2: Require server PR CI**

Required green commands:

```text
npm run typecheck
npm test
npm run build
```

- [ ] **Step 3: Merge only after explicit approval**

Squash merge and record the `main` SHA. Do not treat merge as deployment.

- [ ] **Step 4: Verify deployed Origin allow-list**

```bash
sudo grep '^ALLOWED_ORIGINS=' /etc/qqnd-game-server.env
```

Required values:

```text
https://*.qqnd.fyi
http://localhost:*
http://127.0.0.1:*
```

If localhost entries are missing, append only the missing entries while preserving all existing values:

```bash
sudo python3 - <<'PY'
from pathlib import Path
path=Path('/etc/qqnd-game-server.env')
lines=path.read_text().splitlines()
required=['http://localhost:*','http://127.0.0.1:*']
out=[]; found=False
for line in lines:
    if line.startswith('ALLOWED_ORIGINS='):
        found=True
        values=[v for v in line.split('=',1)[1].split(',') if v]
        for value in required:
            if value not in values: values.append(value)
        line='ALLOWED_ORIGINS='+','.join(values)
    out.append(line)
if not found:
    out.append('ALLOWED_ORIGINS=https://*.qqnd.fyi,'+','.join(required))
path.write_text('\n'.join(out)+'\n')
PY
```

- [ ] **Step 5: Deploy and restart**

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

- [ ] **Step 6: Verify health**

```bash
curl -fsS https://api.qqnd.fyi/api/v1/health
```

Expected: `"ok":true` and `"service":"qqnd-game-server"`.

- [ ] **Step 7: Keep production schema gate in client test**

The first live state in Task 4 must assert:

```js
expect(Array.isArray(state.discarded)).toBe(true);
```

Do not remove this assertion to accommodate an old deployment.

---

### Task 3: Add a safe browser E2E bridge

**Repository:** `quendae/tichu`

**Files:**
- Create `src/e2e-bridge.js`
- Modify `src/ui.js`
- Create `tests/e2e-bridge.test.mjs`
- Create `tests/e2e/e2e-bridge.spec.mjs`

**Produces:** `window.__tichuE2E` only under `?e2e=1`.

- [ ] **Step 1: Write RED unit tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {createTichuE2EBridge,isE2EMode} from '../src/e2e-bridge.js';

test('isE2EMode requires e2e=1 exactly',()=>{
  assert.equal(isE2EMode('?e2e=1'),true);
  assert.equal(isE2EMode('?e2e=true'),false);
  assert.equal(isE2EMode(''),false);
});

test('bridge omits credentials and converts Sets',()=>{
  const game={state:{selected:new Set(['a']),hands:[[{id:'a'}],[{id:'hidden-1',hidden:true}],[],[]]}};
  const mp={
    active:true,authoritative:true,room:{id:'ROOM'},seat:2,stateSeq:7,botSeats:[1,3],socket:{readyState:1},
    presence:[{sessionId:'secret',seat:2,nickname:'P2',connected:true,graceDeadline:null,botActive:false}],
    session:{id:'secret'},resumeToken:'token',action:async()=>true,
  };
  const bridge=createTichuE2EBridge(game,mp);
  const status=bridge.getMultiplayerStatus();
  assert.equal(status.connected,true);
  assert.equal('resumeToken' in status,false);
  assert.equal('session' in status,false);
  assert.equal('sessionId' in status.presence[0],false);
  assert.deepEqual(bridge.getState().selected,['a']);
});

test('bridge delegates actions',async()=>{
  const calls=[];
  const mp={active:true,authoritative:true,room:null,seat:0,stateSeq:0,botSeats:[],presence:[],socket:null,
    action:async(...args)=>{calls.push(args);return true}};
  await createTichuE2EBridge({state:{}},mp).action('grand',{call:false});
  assert.deepEqual(calls,[['grand',{call:false}]]);
});
```

- [ ] **Step 2: Prove RED**

```bash
node --test tests/e2e-bridge.test.mjs
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement `src/e2e-bridge.js`**

```js
const cloneForTest=value=>JSON.parse(JSON.stringify(value,(_key,item)=>item instanceof Set?[...item]:item));
const safePresence=presence=>(presence||[]).map(({seat,nickname,connected,graceDeadline,botActive})=>({seat,nickname,connected,graceDeadline,botActive}));

export function isE2EMode(search=globalThis.location?.search||''){
  return new URLSearchParams(search).get('e2e')==='1';
}

export function createTichuE2EBridge(game,mp){
  return Object.freeze({
    getState:()=>cloneForTest(game.state),
    getMultiplayerStatus:()=>cloneForTest({
      active:!!mp.active,
      authoritative:!!mp.authoritative,
      connected:mp.socket?.readyState===1,
      roomId:mp.room?.id||null,
      seat:Number.isInteger(mp.seat)?mp.seat:null,
      stateSeq:Number(mp.stateSeq||0),
      botSeats:[...(mp.botSeats||[])],
      presence:safePresence(mp.presence),
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

- [ ] **Step 4: Install dynamically in `src/ui.js`**

After `window.tichu={game,mp,uiState};`:

```js
if(new URLSearchParams(location.search).get('e2e')==='1'){
  import('./e2e-bridge.js').then(({installTichuE2EBridge})=>installTichuE2EBridge({game,mp}));
}
```

- [ ] **Step 5: Run unit GREEN**

```bash
node --test tests/e2e-bridge.test.mjs
npm test
```

- [ ] **Step 6: Add browser gating test**

```js
import {test,expect} from '@playwright/test';

test('normal navigation never installs bridge',async({page})=>{
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(await page.evaluate(()=>typeof window.__tichuE2E)).toBe('undefined');
});

test('e2e=1 installs safe bridge',async({page})=>{
  await page.goto('/?e2e=1');
  await expect.poll(()=>page.evaluate(()=>typeof window.__tichuE2E)).toBe('object');
  const status=await page.evaluate(()=>window.__tichuE2E.getMultiplayerStatus());
  expect(status).not.toHaveProperty('resumeToken');
  expect(status).not.toHaveProperty('session');
});
```

- [ ] **Step 7: Verify and commit**

```bash
npx playwright test tests/e2e/e2e-bridge.spec.mjs --project=desktop-1440
git add src/e2e-bridge.js src/ui.js tests/e2e-bridge.test.mjs tests/e2e/e2e-bridge.spec.mjs
git commit -m "test: add safe Tichu multiplayer E2E bridge"
```

---

### Task 4: Add revision-driven 2H+2B production E2E and reconnect

**Repository:** `quendae/tichu`

**Files:**
- Create `playwright.multiplayer.config.mjs`
- Create `tests/e2e-multiplayer/helpers.mjs`
- Create `tests/e2e-multiplayer/live-2h2b.spec.mjs`
- Modify `package.json`

**Interfaces:**
- `sendAndWait(client,type,payload)` sends through the bridge and waits for `stateSeq >= before + 1`.
- `driveHumanDecision(client)` sends zero or one action.
- `canonicalPublicSummary()` compares rotated viewer states in actual-seat coordinates.

- [ ] **Step 1: Create live config**

```js
import {defineConfig,devices} from '@playwright/test';
const baseURL=`http://127.0.0.1:${process.env.PORT||8080}`;
export default defineConfig({
  testDir:'./tests/e2e-multiplayer',timeout:120_000,expect:{timeout:15_000},
  fullyParallel:false,workers:1,retries:process.env.CI?1:0,reporter:'line',
  outputDir:'test-results-multiplayer',
  use:{baseURL,trace:'retain-on-failure',screenshot:'only-on-failure',video:'retain-on-failure'},
  webServer:{command:'npm run serve',url:baseURL,reuseExistingServer:false,timeout:20_000},
  projects:[{name:'live-desktop',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:900}}}],
});
```

- [ ] **Step 2: Create context/lobby helpers**

Start `tests/e2e-multiplayer/helpers.mjs`:

```js
import {expect} from '@playwright/test';
import {possibleSelections} from '../../src/rules.js';

export function runTag(testInfo){return `${process.env.GITHUB_RUN_ID||process.pid}-${testInfo.retry}-${Math.random().toString(36).slice(2,7)}`}
export const bridgeState=client=>client.page.evaluate(()=>window.__tichuE2E.getState());
export const bridgeStatus=client=>client.page.evaluate(()=>window.__tichuE2E.getMultiplayerStatus());

export async function openE2EClient(browser,baseURL,label){
  const context=await browser.newContext(),page=await context.newPage(),errors=[];
  page.on('console',m=>{if(m.type()==='error')errors.push(`console:${m.text()}`)});
  page.on('pageerror',e=>errors.push(`page:${e.message}`));
  page.on('websocket',ws=>ws.on('socketerror',e=>errors.push(`websocket:${String(e)}`)));
  await page.goto(`${baseURL}/?e2e=1`);
  await expect.poll(()=>page.evaluate(()=>typeof window.__tichuE2E)).toBe('object');
  return {context,page,label,errors};
}

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
  await expect.poll(()=>bridgeStatus(host).then(s=>s.active)).toBe(true);
}
```

- [ ] **Step 3: Add canonical/public assertions**

```js
const actualSeat=(local,viewer)=>(viewer+local)%4;
export const canonicalBotSeats=status=>(status.botSeats||[]).map(local=>actualSeat(local,status.seat));

export function canonicalPublicSummary(state,status){
  if(!Number.isInteger(status.seat))throw new Error('missing_viewer_seat');
  return {
    phase:state.phase,round:state.round,
    scores:status.seat%2===1?[state.scores[1],state.scores[0]]:[...state.scores],
    currentPlayer:actualSeat(state.currentPlayer,status.seat),
    trickLeader:actualSeat(state.trickLeader,status.seat),
    finished:(state.finished||[]).map(seat=>actualSeat(seat,status.seat)),wish:state.wish,
    table:(state.table||[]).map(entry=>({seat:actualSeat(entry.seat,status.seat),cards:entry.cards.map(card=>card.id)})),
    discarded:(state.discarded||[]).map(card=>card.id),
  };
}

export function assertPrivateHands(state){
  expect(state.hands[0].some(card=>card.hidden)).toBe(false);
  for(let seat=1;seat<4;seat++)expect(state.hands[seat].every(card=>card.hidden===true)).toBe(true);
}
```

- [ ] **Step 4: Add revision-driven sender and legal driver**

```js
export async function sendAndWait(client,type,payload={}){
  const before=(await bridgeStatus(client)).stateSeq;
  const sent=await client.page.evaluate(({type,payload})=>window.__tichuE2E.action(type,payload),{type,payload});
  if(!sent)throw new Error(`action_not_sent:${type}`);
  await client.page.evaluate(min=>window.__tichuE2E.waitForRevision(min,15_000),before+1);
  return bridgeState(client);
}

export async function driveHumanDecision(client){
  const state=await bridgeState(client);
  if(state.phase==='grand'&&!state.declarations[0]){await sendAndWait(client,'grand',{call:false});return {acted:true,type:'grand'}}
  if(state.phase==='exchange'&&!state.exchangeDone[0]){
    const ids=state.hands[0].slice(0,3).map(card=>card.id);
    if(ids.length!==3||new Set(ids).size!==3)throw new Error('insufficient_exchange_cards');
    await sendAndWait(client,'exchange',{map:{1:ids[0],2:ids[1],3:ids[2]}});return {acted:true,type:'exchange'};
  }
  if(state.phase==='play'&&state.dragonRecipient==='needed'){
    if(state.table.at(-1)?.seat===0){await sendAndWait(client,'dragon',{seat:1});return {acted:true,type:'dragon'}}
    return {acted:false,type:null};
  }
  if(state.phase!=='play'||state.currentPlayer!==0)return {acted:false,type:null};
  let options=possibleSelections(state.hands[0],state.lastPlay,state.wish);
  if(state.wish&&options.some(o=>o.fulfills))options=options.filter(o=>o.fulfills);
  const chosen=options.find(o=>o.play.type!=='bomb')||options[0];
  if(!chosen){if(!state.lastPlay)return {acted:false,type:null};await sendAndWait(client,'pass',{});return {acted:true,type:'pass'}}
  await sendAndWait(client,'play',{ids:chosen.cards.map(card=>card.id),wishRank:chosen.cards.some(card=>card.special==='mahjong')?14:null});
  return {acted:true,type:'play'};
}
```

- [ ] **Step 5: Add synchronization, diagnostics, cleanup**

```js
export async function waitForSameRevision(clients,minimum=1){
  let agreed=0;
  await expect.poll(async()=>{
    const revisions=(await Promise.all(clients.map(bridgeStatus))).map(s=>s.stateSeq);
    if(revisions.every(v=>v>=minimum)&&new Set(revisions).size===1)agreed=revisions[0];
    return agreed;
  },{timeout:15_000}).toBeGreaterThanOrEqual(minimum);
  return agreed;
}

export async function attachDiagnostics(testInfo,clients,roomId,nicknames){
  const rows=[];
  for(const client of clients){
    try{const status=await bridgeStatus(client),state=await bridgeState(client);rows.push({label:client.label,status,public:canonicalPublicSummary(state,status),errors:client.errors})}
    catch(error){rows.push({label:client.label,diagnosticError:error.message,errors:client.errors})}
  }
  await testInfo.attach('multiplayer-diagnostics',{body:JSON.stringify({roomId,nicknames,clients:rows},null,2),contentType:'application/json'});
}

export async function cleanupClients(clients){
  const errors=[];
  for(const client of clients){try{await client.page.evaluate(()=>window.tichu?.mp?.room?window.tichu.mp.leave():null)}catch(e){errors.push(`${client.label}:leave:${e.message}`)}}
  for(const client of clients){try{await client.context.close()}catch(e){errors.push(`${client.label}:close:${e.message}`)}}
  return errors;
}
```

- [ ] **Step 6: Create `live-2h2b.spec.mjs`**

```js
import {test,expect} from '@playwright/test';
import {
  assertPrivateHands,attachDiagnostics,bridgeState,bridgeStatus,canonicalPublicSummary,cleanupClients,
  createPrivateRoom,driveHumanDecision,joinPrivateRoom,openE2EClient,runTag,startWithBots,waitForSameRevision,
} from './helpers.mjs';

test('production QQND: 2 humans + 2 bots synchronize, redact and reconnect',async({browser},testInfo)=>{
  const baseURL=testInfo.project.use.baseURL;if(typeof baseURL!=='string')throw new Error('missing_base_url');
  const tag=runTag(testInfo),nicknames=[`E2E-${tag}-H1`,`E2E-${tag}-H2`],clients=[];
  let roomId=null,failed=false;
  try{
    const h1=await openE2EClient(browser,baseURL,'H1');clients.push(h1);
    const h2=await openE2EClient(browser,baseURL,'H2');clients.push(h2);
    roomId=await createPrivateRoom(h1,nicknames[0]);await joinPrivateRoom(h2,nicknames[1],roomId);await startWithBots(h1);
    await expect.poll(()=>bridgeStatus(h2).then(s=>s.active)).toBe(true);
    const initial=[await bridgeState(h1),await bridgeState(h2)];
    initial.forEach(s=>expect(Array.isArray(s.discarded)).toBe(true));
    initial.forEach(assertPrivateHands);

    let completedTricks=0,actions=0,previous=initial[0];const deadline=Date.now()+45_000;
    while(Date.now()<deadline&&completedTricks<1){
      let acted=false;
      for(const client of [h1,h2]){const result=await driveHumanDecision(client);if(result.acted){acted=true;actions++;break}}
      if(!acted)await new Promise(resolve=>setTimeout(resolve,200));
      const current=await bridgeState(h1);
      if(previous.table?.length>0&&current.table?.length===0&&current.lastPlay===null&&(current.discarded?.length||0)===(previous.discarded?.length||0))completedTricks++;
      previous=current;
    }
    expect(actions).toBeGreaterThanOrEqual(4);expect(completedTricks).toBeGreaterThanOrEqual(1);

    const revision=await waitForSameRevision([h1,h2]);
    await h2.page.evaluate(()=>window.__tichuE2E.closeSocket());
    await expect.poll(()=>bridgeStatus(h2).then(s=>s.connected),{timeout:10_000}).toBe(false);
    await expect.poll(()=>bridgeStatus(h2).then(s=>s.connected),{timeout:20_000}).toBe(true);
    const resumed=await bridgeStatus(h2);expect(resumed.roomId).toBe(roomId);expect(resumed.stateSeq).toBeGreaterThanOrEqual(revision);
    const [s1,s2]=await Promise.all([bridgeState(h1),bridgeState(h2)]),[m1,m2]=await Promise.all([bridgeStatus(h1),bridgeStatus(h2)]);
    expect(canonicalPublicSummary(s1,m1)).toEqual(canonicalPublicSummary(s2,m2));assertPrivateHands(s1);assertPrivateHands(s2);
  }catch(error){failed=true;throw error}
  finally{if(failed)await attachDiagnostics(testInfo,clients,roomId,nicknames);const e=await cleanupClients(clients);if(e.length)await testInfo.attach('cleanup-errors',{body:e.join('\n'),contentType:'text/plain'})}
});
```

- [ ] **Step 7: Add script, run live GREEN, commit**

```json
"test:e2e:multiplayer": "playwright test -c playwright.multiplayer.config.mjs tests/e2e-multiplayer/live-2h2b.spec.mjs"
```

```bash
npm run test:e2e:multiplayer
git add playwright.multiplayer.config.mjs tests/e2e-multiplayer/helpers.mjs tests/e2e-multiplayer/live-2h2b.spec.mjs package.json
git commit -m "test: add production Tichu multiplayer E2E"
```

Expected after Task 2 deployment: one live test passes and receives `discarded` from production.

---

### Task 5: Add manual four-human and takeover smoke

**Repository:** `quendae/tichu`

**Files:**
- Modify `tests/e2e-multiplayer/helpers.mjs`
- Create `tests/e2e-multiplayer/full-4h.spec.mjs`
- Create `tests/e2e-multiplayer/takeover.spec.mjs`
- Modify `package.json`

- [ ] **Step 1: Add no-bot start helper**

```js
export async function startWithoutBots(host){
  await host.page.locator('#mp-bots').uncheck();
  await expect(host.page.locator('#mp-start')).toBeEnabled();
  await host.page.locator('#mp-start').click();
  await expect.poll(()=>bridgeStatus(host).then(s=>s.active)).toBe(true);
}
```

- [ ] **Step 2: Create four-human smoke**

```js
import {test,expect} from '@playwright/test';
import {
  assertPrivateHands,attachDiagnostics,bridgeState,bridgeStatus,canonicalPublicSummary,cleanupClients,
  createPrivateRoom,driveHumanDecision,joinPrivateRoom,openE2EClient,runTag,startWithoutBots,
} from './helpers.mjs';

test('production QQND: four humans play with no bots',async({browser},testInfo)=>{
  const baseURL=testInfo.project.use.baseURL;if(typeof baseURL!=='string')throw new Error('missing_base_url');
  const tag=runTag(testInfo),nicknames=[1,2,3,4].map(n=>`E2E-${tag}-H${n}`),clients=[];let roomId=null,failed=false;
  try{
    for(let i=0;i<4;i++)clients.push(await openE2EClient(browser,baseURL,`H${i+1}`));
    roomId=await createPrivateRoom(clients[0],nicknames[0]);for(let i=1;i<4;i++)await joinPrivateRoom(clients[i],nicknames[i],roomId);
    await startWithoutBots(clients[0]);for(const c of clients)await expect.poll(()=>bridgeStatus(c).then(s=>s.active)).toBe(true);
    for(const c of clients)assertPrivateHands(await bridgeState(c));
    let playActions=0;const deadline=Date.now()+60_000;
    while(Date.now()<deadline&&playActions<6){let acted=false;for(const c of clients){const r=await driveHumanDecision(c);if(r.acted){acted=true;if(['play','pass','dragon'].includes(r.type))playActions++;break}}if(!acted)await new Promise(r=>setTimeout(r,200))}
    expect(playActions).toBeGreaterThanOrEqual(6);
    const summaries=await Promise.all(clients.map(async c=>canonicalPublicSummary(await bridgeState(c),await bridgeStatus(c))));for(const s of summaries.slice(1))expect(s).toEqual(summaries[0]);
    for(const c of clients)expect((await bridgeStatus(c)).botSeats).toEqual([]);
  }catch(error){failed=true;throw error}
  finally{if(failed)await attachDiagnostics(testInfo,clients,roomId,nicknames);const e=await cleanupClients(clients);if(e.length)await testInfo.attach('cleanup-errors',{body:e.join('\n'),contentType:'text/plain'})}
});
```

- [ ] **Step 3: Create 60-second takeover smoke**

```js
import {test,expect} from '@playwright/test';
import {attachDiagnostics,bridgeStatus,canonicalBotSeats,cleanupClients,createPrivateRoom,driveHumanDecision,joinPrivateRoom,openE2EClient,runTag,startWithBots} from './helpers.mjs';

test('production QQND: disconnected human becomes substitute bot after grace',async({browser},testInfo)=>{
  const baseURL=testInfo.project.use.baseURL;if(typeof baseURL!=='string')throw new Error('missing_base_url');
  const tag=runTag(testInfo),nicknames=[`E2E-${tag}-H1`,`E2E-${tag}-H2`],clients=[];let roomId=null,failed=false;
  try{
    const h1=await openE2EClient(browser,baseURL,'H1');clients.push(h1);const h2=await openE2EClient(browser,baseURL,'H2');clients.push(h2);
    roomId=await createPrivateRoom(h1,nicknames[0]);await joinPrivateRoom(h2,nicknames[1],roomId);await startWithBots(h1);await expect.poll(()=>bridgeStatus(h2).then(s=>s.active)).toBe(true);
    const disconnectedSeat=(await bridgeStatus(h2)).seat,revisionBefore=(await bridgeStatus(h1)).stateSeq;
    await h2.context.close();clients.splice(clients.indexOf(h2),1);
    await expect.poll(async()=>{const s=await bridgeStatus(h1);return s.presence.some(p=>p.seat===disconnectedSeat&&p.botActive===true)},{timeout:75_000,interval:1_000}).toBe(true);
    await expect.poll(async()=>canonicalBotSeats(await bridgeStatus(h1)).includes(disconnectedSeat),{timeout:5_000}).toBe(true);
    const deadline=Date.now()+15_000;while(Date.now()<deadline&&(await bridgeStatus(h1)).stateSeq<=revisionBefore){await driveHumanDecision(h1);await new Promise(r=>setTimeout(r,200))}
    expect((await bridgeStatus(h1)).stateSeq).toBeGreaterThan(revisionBefore);
  }catch(error){failed=true;throw error}
  finally{if(failed)await attachDiagnostics(testInfo,clients,roomId,nicknames);const e=await cleanupClients(clients);if(e.length)await testInfo.attach('cleanup-errors',{body:e.join('\n'),contentType:'text/plain'})}
});
```

- [ ] **Step 4: Add full-smoke script**

```json
"test:e2e:multiplayer:full": "playwright test -c playwright.multiplayer.config.mjs tests/e2e-multiplayer/full-4h.spec.mjs tests/e2e-multiplayer/takeover.spec.mjs"
```

- [ ] **Step 5: Run once and commit**

```bash
npm run test:e2e:multiplayer:full
git add tests/e2e-multiplayer/helpers.mjs tests/e2e-multiplayer/full-4h.spec.mjs tests/e2e-multiplayer/takeover.spec.mjs package.json
git commit -m "test: add full Tichu multiplayer smoke"
```

Record total duration and takeover duration for the PR body.

---

### Task 6: CI and documentation

**Repository:** `quendae/tichu`

**Files:**
- Modify `.github/workflows/ci.yml`
- Modify `README.md`

- [ ] **Step 1: Add bounded live CI after offline Playwright**

```yaml
      - run: npm run test:e2e
      - name: Live multiplayer E2E
        run: npm run test:e2e:multiplayer
```

- [ ] **Step 2: Upload live diagnostics**

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

- [ ] **Step 3: Add README commands/safety note**

```md
### Multiplayer E2E

The bounded live test uses `wss://api.qqnd.fyi/api/v1/ws`, unique private
rooms, two isolated human browser sessions and two server bots.

```bash
npm run test:e2e:multiplayer
```

The heavier four-human + substitute-bot smoke is manual because production
uses a 60-second disconnect grace period:

```bash
npm run test:e2e:multiplayer:full
```

The bridge exists only with `?e2e=1` and exposes only the viewer's redacted
state. Failed runs may leave private rooms/sessions until server TTL cleanup;
tests never modify rooms they did not create.
```

- [ ] **Step 4: Verify and commit**

```bash
npm test
npx playwright test tests/e2e/e2e-bridge.spec.mjs --project=desktop-1440
npm run test:e2e:multiplayer
git add .github/workflows/ci.yml README.md
git commit -m "ci: run bounded Tichu multiplayer E2E"
```

---

### Task 7: Final verification and PR handoff

**Repositories:** both.

- [ ] **Step 1: Fresh server verification**

```bash
npm run typecheck && npm test && npm run build
```

- [ ] **Step 2: Fresh deployed health check**

```bash
curl -fsS https://api.qqnd.fyi/api/v1/health
```

The `discarded` deployment claim additionally requires Task 4's live schema assertion.

- [ ] **Step 3: Fresh complete Tichu verification**

```bash
npm test
npm run test:sim
npm run test:e2e
npm run test:e2e:multiplayer
npm run test:e2e:multiplayer:full
```

Record pass counts, expected skips and durations.

- [ ] **Step 4: Production-boundary review**

Verify all seven statements:

```text
1. window.__tichuE2E is installed only for e2e=1.
2. Bridge status contains no session/resumeToken/sessionId.
3. Diagnostics contain only viewer-redacted state/public summaries.
4. Game actions go through MultiplayerClient.action().
5. No test-only server endpoint was added.
6. Every E2E room is private and uniquely named.
7. Default CI excludes the 60-second takeover smoke.
```

- [ ] **Step 5: Open Tichu PR only after production live GREEN**

Title:

```text
Add production multiplayer E2E coverage
```

Body must contain:

```text
server prerequisite PR + deployed SHA
api.qqnd.fyi confirmation
unit/simulation/offline Playwright results
2H+2B result + runtime
reconnect result
4-human result + runtime
60-second takeover result + runtime
private-room isolation statement
hidden-hand/credential safety statement
```

- [ ] **Step 6: Require fresh PR-triggered CI**

Confirm green:

```text
npm test
npm run test:sim
npm run test:e2e
npm run test:e2e:multiplayer
```

- [ ] **Step 7: Stop before client merge**

Report PR URL, head SHA, CI status, bounded-live result and full-smoke result. Do not merge without explicit user approval.
