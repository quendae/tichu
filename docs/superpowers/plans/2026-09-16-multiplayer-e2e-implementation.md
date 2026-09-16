# Tichu Multiplayer E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production-backed multiplayer E2E coverage for Tichu using `api.qqnd.fyi`, with two human browser sessions plus two server bots in CI, reconnect coverage in CI, and four-human/bot-takeover coverage as an explicit full smoke.

**Architecture:** The QQND server remains authoritative. First synchronize its Tichu state model with the client by preserving Dog in a non-scoring `discarded` pile and deploy that change. Then add a test-only bridge to the browser client, enabled only by `?e2e=1`, and drive unique private rooms on `wss://api.qqnd.fyi/api/v1/ws` from isolated Playwright contexts. Lobby/start flows stay UI-driven; gameplay actions use the same `MultiplayerClient.action()` path as the UI and read only each viewer's already-redacted state.

**Tech Stack:** Node.js 22 for `quendae/tichu`, Node.js 24 for `quendae/qqnd-game-server`, ES modules, Playwright 1.55+, native `node:test`, TypeScript 7, Fastify, `ws`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-16-multiplayer-e2e-design.md`

## Global Constraints

- Live integration target is exactly `wss://api.qqnd.fyi/api/v1/ws`.
- Live tests create only private rooms and unique `E2E-*` identities.
- Live tests never inspect or print resume tokens or another player's real hand.
- The E2E bridge exists only when the page query contains `e2e=1`.
- Lobby creation, joining, room-code entry, bot-fill selection and game start are exercised through the real UI.
- Gameplay actions sent by the bridge call the existing `MultiplayerClient.action()` path; no direct server mutation or second browser-side protocol client.
- Server-side Dog is preserved in `discarded`, which is public, non-scoring state.
- Default live CI is 2 humans + 2 server bots and includes transient reconnect.
- Default live CI does not wait for the server's 60-second substitute-bot grace period.
- Bot takeover and four-human/no-bot coverage run through the explicit full-smoke command.
- Existing offline unit, deterministic simulation, and visual Playwright suites stay green.
- Server deployment precedes Dog-schema-dependent production E2E assertions.
- Cleanup errors are diagnostics only and never replace the first substantive failure.
- The production server must allow the Playwright app origin (`http://127.0.0.1:*`); `.env.example` already defines that origin, but the deployed `/etc/qqnd-game-server.env` must be checked explicitly.

---

## File Map

### `quendae/qqnd-game-server` — branch `feature/tichu-multiplayer-e2e-support`

- Modify `src/games/tichu/engine.ts` — add/reset `discarded`, preserve Dog there.
- Modify `test/tichu-engine.test.ts` — Dog conservation and seat-view regression.

### `quendae/tichu` — branch `feature/multiplayer-e2e`

- Create `src/e2e-bridge.js` — safe test-only bridge over `game` + `MultiplayerClient`.
- Modify `src/ui.js` — dynamically install bridge only for `?e2e=1`.
- Create `tests/e2e-bridge.test.mjs` — pure bridge safety tests.
- Create `tests/e2e/e2e-bridge.spec.mjs` — browser gating test.
- Create `playwright.multiplayer.config.mjs` — serial live desktop config.
- Create `tests/e2e-multiplayer/helpers.mjs` — context/lobby/action/sync/diagnostic helpers.
- Create `tests/e2e-multiplayer/live-2h2b.spec.mjs` — CI live path + reconnect.
- Create `tests/e2e-multiplayer/full-4h.spec.mjs` — manual 4-human smoke.
- Create `tests/e2e-multiplayer/takeover.spec.mjs` — manual 60-second takeover smoke.
- Modify `package.json`, `.github/workflows/ci.yml`, `README.md`.

---

### Task 1: Fix Dog conservation in the authoritative QQND engine

**Repository:** `quendae/qqnd-game-server`

**Files:**
- Modify: `src/games/tichu/engine.ts`
- Modify: `test/tichu-engine.test.ts`

**Interfaces:**
- Consumes: `TichuState`, `createTichuGame()`, `reduceTichuAction()`, `tichuStateForSeat()`.
- Produces: `TichuState.discarded: TichuCard[]`.

- [ ] **Step 1: Write a failing Dog-conservation regression**

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

- [ ] **Step 2: Run focused RED**

```bash
npx tsx --test --test-name-pattern="Dog remains accounted" test/tichu-engine.test.ts
```

Expected: FAIL; current authoritative state loses Dog and has only 55 live cards after the play.

- [ ] **Step 3: Add `discarded` to state creation/reset**

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

- [ ] **Step 4: Preserve Dog before clearing the table**

Replace the Dog branch with:

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

Do not include `discarded` in scoring.

- [ ] **Step 5: Add public seat-view coverage**

```ts
test("tichu seat views preserve the public discarded pile", () => {
  const state = createTichuGame(["A", "B", "C", "D"]);
  state.discarded = [{ id: "dog", suit: null, rank: 0, special: "dog" }];
  const view = tichuStateForSeat(state, 3);
  assert.deepEqual(view.discarded.map((card) => card.id), ["dog"]);
});
```

`tichuStateForSeat()` should need no special redaction because `discarded` is public.

- [ ] **Step 6: Run focused GREEN and full server verification**

```bash
npx tsx --test --test-name-pattern="Dog remains accounted|discarded pile" test/tichu-engine.test.ts
npm run typecheck
npm test
npm run build
```

Expected: exit 0 for all commands.

- [ ] **Step 7: Commit**

```bash
git add src/games/tichu/engine.ts test/tichu-engine.test.ts
git commit -m "fix: preserve Tichu Dog in authoritative state"
```

---

### Task 2: Integrate/deploy the server prerequisite and prove the live environment is usable

**Repository:** `quendae/qqnd-game-server`

**Files:**
- No additional source file.
- Runtime config: `/etc/qqnd-game-server.env`.
- Service: `qqnd-game-server.service`.

**Interfaces:**
- Produces production `game.state.state.discarded` and a localhost-compatible WebSocket origin policy.
- Gates all subsequent production E2E.

- [ ] **Step 1: Push branch and open server PR**

```bash
git push -u origin feature/tichu-multiplayer-e2e-support
```

PR title:

```text
Preserve Tichu Dog in authoritative state
```

PR body records results of `npm run typecheck`, `npm test`, `npm run build`.

- [ ] **Step 2: Require green server PR CI**

The PR run must execute successfully:

```text
npm run typecheck
npm test
npm run build
```

Do not merge a red run.

- [ ] **Step 3: Merge only after explicit integration approval**

Use squash merge and record the resulting `main` SHA. A GitHub merge is not treated as a deployment.

- [ ] **Step 4: Check production origin policy before restarting**

On the LXC:

```bash
sudo grep '^ALLOWED_ORIGINS=' /etc/qqnd-game-server.env
```

Required production value must include the existing QQND origin plus these test origins:

```text
https://*.qqnd.fyi
http://localhost:*
http://127.0.0.1:*
```

If either localhost origin is missing, preserve the existing list and append only the missing entries with:

```bash
sudo python3 - <<'PY'
from pathlib import Path
path=Path('/etc/qqnd-game-server.env')
lines=path.read_text().splitlines()
required=['http://localhost:*','http://127.0.0.1:*']
out=[]
found=False
for line in lines:
    if line.startswith('ALLOWED_ORIGINS='):
        found=True
        values=[v for v in line.split('=',1)[1].split(',') if v]
        for value in required:
            if value not in values:
                values.append(value)
        line='ALLOWED_ORIGINS='+','.join(values)
    out.append(line)
if not found:
    out.append('ALLOWED_ORIGINS=https://*.qqnd.fyi,'+','.join(required))
path.write_text('\n'.join(out)+'\n')
PY
```

- [ ] **Step 5: Deploy merged server revision**

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

Expected: tests/build exit 0; service is active/running.

- [ ] **Step 6: Verify health**

```bash
curl -fsS https://api.qqnd.fyi/api/v1/health
```

Expected JSON contains `"ok":true` and `"service":"qqnd-game-server"`.

- [ ] **Step 7: Keep a schema gate in the first client live test**

The first real authoritative state in Task 4 must execute:

```js
expect(Array.isArray(state.discarded)).toBe(true);
```

Failure means production is not on the required server schema; do not weaken the assertion.

---

### Task 3: Add a safe `?e2e=1` browser bridge

**Repository:** `quendae/tichu`

**Files:**
- Create: `src/e2e-bridge.js`
- Modify: `src/ui.js`
- Create: `tests/e2e-bridge.test.mjs`
- Create: `tests/e2e/e2e-bridge.spec.mjs`

**Interfaces:**
- Produces `isE2EMode(search)`, `createTichuE2EBridge(game,mp)`, `installTichuE2EBridge({game,mp,target})`.
- Browser surface: `window.__tichuE2E` only for `e2e=1`.
- Safe status fields: `active`, `authoritative`, `connected`, `roomId`, `seat`, `stateSeq`, `botSeats`, sanitized `presence`.

- [ ] **Step 1: Write RED unit tests**

Create `tests/e2e-bridge.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {createTichuE2EBridge,isE2EMode} from '../src/e2e-bridge.js';

test('isE2EMode requires e2e=1 exactly',()=>{
  assert.equal(isE2EMode('?e2e=1'),true);
  assert.equal(isE2EMode('?e2e=true'),false);
  assert.equal(isE2EMode(''),false);
});

test('bridge omits credentials and converts Sets to arrays',()=>{
  const game={state:{phase:'grand',hands:[[{id:'a'}],[{id:'hidden-1',hidden:true}],[],[]],selected:new Set(['a'])}};
  const mp={
    active:true,authoritative:true,room:{id:'ROOM'},seat:2,stateSeq:7,botSeats:[1,3],
    presence:[{sessionId:'secret-session',seat:2,nickname:'P2',connected:true,graceDeadline:null,botActive:false}],
    session:{id:'secret-session'},resumeToken:'secret-token',socket:{readyState:1},
    action:async()=>true,
  };
  const bridge=createTichuE2EBridge(game,mp);
  const status=bridge.getMultiplayerStatus();
  assert.equal(status.roomId,'ROOM');
  assert.equal(status.connected,true);
  assert.equal('session' in status,false);
  assert.equal('resumeToken' in status,false);
  assert.equal('sessionId' in status.presence[0],false);
  assert.deepEqual(bridge.getState().selected,['a']);
});

test('bridge delegates game actions to MultiplayerClient.action',async()=>{
  const calls=[];
  const game={state:{}};
  const mp={active:true,authoritative:true,room:null,seat:0,stateSeq:0,botSeats:[],presence:[],socket:null,
    action:async(...args)=>{calls.push(args);return true}};
  await createTichuE2EBridge(game,mp).action('grand',{call:false});
  assert.deepEqual(calls,[['grand',{call:false}]]);
});
```

- [ ] **Step 2: Verify RED**

```bash
node --test tests/e2e-bridge.test.mjs
```

Expected: FAIL because `src/e2e-bridge.js` does not exist.

- [ ] **Step 3: Implement the bridge**

Create `src/e2e-bridge.js`:

```js
const cloneForTest=value=>JSON.parse(JSON.stringify(value,(_key,item)=>item instanceof Set?[...item]:item));
const socketOpen=socket=>socket?.readyState===1;
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
      connected:socketOpen(mp.socket),
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

- [ ] **Step 4: Install dynamically from `src/ui.js`**

After `window.tichu={game,mp,uiState};` add:

```js
if(new URLSearchParams(location.search).get('e2e')==='1'){
  import('./e2e-bridge.js').then(({installTichuE2EBridge})=>installTichuE2EBridge({game,mp}));
}
```

Do not add a static bridge import.

- [ ] **Step 5: Run unit GREEN**

```bash
node --test tests/e2e-bridge.test.mjs
npm test
```

Expected: pass.

- [ ] **Step 6: Add browser gating test**

Create `tests/e2e/e2e-bridge.spec.mjs`:

```js
import {test,expect} from '@playwright/test';

test('normal navigation never installs the E2E bridge',async({page})=>{
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(await page.evaluate(()=>typeof window.__tichuE2E)).toBe('undefined');
});

test('e2e=1 installs a credential-safe bridge',async({page})=>{
  await page.goto('/?e2e=1');
  await expect.poll(()=>page.evaluate(()=>typeof window.__tichuE2E)).toBe('object');
  const status=await page.evaluate(()=>window.__tichuE2E.getMultiplayerStatus());
  expect(status).not.toHaveProperty('resumeToken');
  expect(status).not.toHaveProperty('session');
});
```

- [ ] **Step 7: Run focused browser GREEN and commit**

```bash
npx playwright test tests/e2e/e2e-bridge.spec.mjs --project=desktop-1440
git add src/e2e-bridge.js src/ui.js tests/e2e-bridge.test.mjs tests/e2e/e2e-bridge.spec.mjs
git commit -m "test: add safe Tichu multiplayer E2E bridge"
```

---

### Task 4: Add 2-human + 2-bot production E2E with reconnect

**Repository:** `quendae/tichu`

**Files:**
- Create: `playwright.multiplayer.config.mjs`
- Create: `tests/e2e-multiplayer/helpers.mjs`
- Create: `tests/e2e-multiplayer/live-2h2b.spec.mjs`
- Modify: `package.json`

**Interfaces:**
- `openE2EClient(browser,baseURL,label)` -> isolated `{context,page,label,errors}`.
- `bridgeState`, `bridgeStatus` -> safe viewer data.
- `canonicalPublicSummary(state,status)` -> actual-seat public state.
- `driveHumanDecision(client)` -> sends at most one legal action.
- `attachDiagnostics(testInfo,clients,roomId,nicknames)` -> redaction-safe failure diagnostics.
- `cleanupClients(clients)` -> leave own room + close contexts.

- [ ] **Step 1: Create serial live config**

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

- [ ] **Step 2: Create room/client helpers and WebSocket-safe diagnostics**

Start `tests/e2e-multiplayer/helpers.mjs` with:

```js
import {expect} from '@playwright/test';
import {possibleSelections} from '../../src/rules.js';

export function runTag(testInfo){
  return `${process.env.GITHUB_RUN_ID||process.pid}-${testInfo.retry}-${Math.random().toString(36).slice(2,7)}`;
}

export async function openE2EClient(browser,baseURL,label){
  const context=await browser.newContext();
  const page=await context.newPage();
  const errors=[];
  page.on('console',message=>{if(message.type()==='error')errors.push(`console:${message.text()}`)});
  page.on('pageerror',error=>errors.push(`page:${error.message}`));
  page.on('websocket',socket=>socket.on('socketerror',error=>errors.push(`websocket:${String(error)}`)));
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
  await expect.poll(()=>bridgeStatus(host).then(status=>status.active)).toBe(true);
}
```

- [ ] **Step 3: Add state/canonicalization helpers**

```js
export const bridgeState=client=>client.page.evaluate(()=>window.__tichuE2E.getState());
export const bridgeStatus=client=>client.page.evaluate(()=>window.__tichuE2E.getMultiplayerStatus());
const actualSeat=(local,viewer)=>(viewer+local)%4;

export function canonicalBotSeats(status){
  return (status.botSeats||[]).map(local=>actualSeat(local,status.seat));
}

export function canonicalPublicSummary(state,status){
  if(!Number.isInteger(status.seat))throw new Error('missing_viewer_seat');
  return {
    phase:state.phase,
    round:state.round,
    scores:status.seat%2===1?[state.scores[1],state.scores[0]]:[...state.scores],
    currentPlayer:actualSeat(state.currentPlayer,status.seat),
    trickLeader:actualSeat(state.trickLeader,status.seat),
    finished:(state.finished||[]).map(seat=>actualSeat(seat,status.seat)),
    wish:state.wish,
    table:(state.table||[]).map(entry=>({seat:actualSeat(entry.seat,status.seat),cards:entry.cards.map(card=>card.id)})),
    discarded:(state.discarded||[]).map(card=>card.id),
  };
}

export function assertPrivateHands(state){
  expect(state.hands[0].some(card=>card.hidden)).toBe(false);
  for(let seat=1;seat<4;seat++)expect(state.hands[seat].every(card=>card.hidden===true)).toBe(true);
}
```

- [ ] **Step 4: Add one-decision legal driver**

```js
export async function driveHumanDecision(client){
  const state=await bridgeState(client);
  if(state.phase==='grand'&&!state.declarations[0]){
    await client.page.evaluate(()=>window.__tichuE2E.action('grand',{call:false}));
    return {acted:true,type:'grand'};
  }
  if(state.phase==='exchange'&&!state.exchangeDone[0]){
    const ids=state.hands[0].slice(0,3).map(card=>card.id);
    if(ids.length!==3||new Set(ids).size!==3)throw new Error('insufficient_exchange_cards');
    const payload={map:{1:ids[0],2:ids[1],3:ids[2]}};
    await client.page.evaluate(value=>window.__tichuE2E.action('exchange',value),payload);
    return {acted:true,type:'exchange'};
  }
  if(state.phase==='play'&&state.dragonRecipient==='needed'){
    if(state.table.at(-1)?.seat===0){
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
  const payload={ids:chosen.cards.map(card=>card.id),wishRank:chosen.cards.some(card=>card.special==='mahjong')?14:null};
  await client.page.evaluate(value=>window.__tichuE2E.action('play',value),payload);
  return {acted:true,type:'play'};
}
```

- [ ] **Step 5: Add synchronization, diagnostics and cleanup**

```js
export async function waitForSameRevision(clients,minimum=1){
  return expect.poll(async()=>{
    const statuses=await Promise.all(clients.map(bridgeStatus));
    const revisions=statuses.map(status=>status.stateSeq);
    return revisions.every(value=>value>=minimum)&&new Set(revisions).size===1?revisions[0]:0;
  },{timeout:15_000}).toBeGreaterThanOrEqual(minimum);
}

export async function attachDiagnostics(testInfo,clients,roomId,nicknames){
  const rows=[];
  for(const client of clients){
    try{
      const status=await bridgeStatus(client),state=await bridgeState(client);
      rows.push({label:client.label,status,public:canonicalPublicSummary(state,status),errors:client.errors});
    }catch(error){rows.push({label:client.label,diagnosticError:error.message,errors:client.errors})}
  }
  await testInfo.attach('multiplayer-diagnostics',{
    body:JSON.stringify({roomId,nicknames,clients:rows},null,2),
    contentType:'application/json',
  });
}

export async function cleanupClients(clients){
  const errors=[];
  for(const client of clients){
    try{await client.page.evaluate(()=>window.tichu?.mp?.room?window.tichu.mp.leave():null)}
    catch(error){errors.push(`${client.label}:leave:${error.message}`)}
  }
  for(const client of clients){
    try{await client.context.close()}
    catch(error){errors.push(`${client.label}:close:${error.message}`)}
  }
  return errors;
}
```

Diagnostics intentionally contain public summaries, nicknames, revisions and browser/WebSocket errors, but no resume token and no opponent real cards.

- [ ] **Step 6: Write the production 2H+2B + reconnect test**

Create `tests/e2e-multiplayer/live-2h2b.spec.mjs`:

```js
import {test,expect} from '@playwright/test';
import {
  assertPrivateHands,attachDiagnostics,bridgeState,bridgeStatus,canonicalPublicSummary,cleanupClients,
  createPrivateRoom,driveHumanDecision,joinPrivateRoom,openE2EClient,runTag,startWithBots,waitForSameRevision,
} from './helpers.mjs';

test('production QQND: 2 humans + 2 bots synchronize, redact and reconnect',async({browser},testInfo)=>{
  const baseURL=testInfo.project.use.baseURL;
  if(typeof baseURL!=='string')throw new Error('missing_base_url');
  const tag=runTag(testInfo),nicknames=[`E2E-${tag}-H1`,`E2E-${tag}-H2`],clients=[];
  let roomId=null,failed=false;
  try{
    const h1=await openE2EClient(browser,baseURL,'H1');clients.push(h1);
    const h2=await openE2EClient(browser,baseURL,'H2');clients.push(h2);
    roomId=await createPrivateRoom(h1,nicknames[0]);
    await joinPrivateRoom(h2,nicknames[1],roomId);
    await startWithBots(h1);
    await expect.poll(()=>bridgeStatus(h2).then(status=>status.active)).toBe(true);

    const initial=[await bridgeState(h1),await bridgeState(h2)];
    initial.forEach(state=>expect(Array.isArray(state.discarded)).toBe(true));
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
    await h2.page.evaluate(()=>window.__tichuE2E.closeSocket());
    await expect.poll(()=>bridgeStatus(h2).then(status=>status.connected),{timeout:10_000}).toBe(false);
    await expect.poll(()=>bridgeStatus(h2).then(status=>status.connected),{timeout:20_000}).toBe(true);
    const resumed=await bridgeStatus(h2);
    expect(resumed.roomId).toBe(roomId);
    expect(resumed.stateSeq).toBeGreaterThanOrEqual(revision);

    const [s1,s2]=await Promise.all([bridgeState(h1),bridgeState(h2)]);
    const [m1,m2]=await Promise.all([bridgeStatus(h1),bridgeStatus(h2)]);
    expect(canonicalPublicSummary(s1,m1)).toEqual(canonicalPublicSummary(s2,m2));
    assertPrivateHands(s1);assertPrivateHands(s2);
  }catch(error){failed=true;throw error}
  finally{
    if(failed)await attachDiagnostics(testInfo,clients,roomId,nicknames);
    const cleanupErrors=await cleanupClients(clients);
    if(cleanupErrors.length)await testInfo.attach('cleanup-errors',{body:cleanupErrors.join('\n'),contentType:'text/plain'});
  }
});
```

- [ ] **Step 7: Add bounded live npm script**

Add to `package.json`:

```json
"test:e2e:multiplayer": "playwright test -c playwright.multiplayer.config.mjs tests/e2e-multiplayer/live-2h2b.spec.mjs"
```

- [ ] **Step 8: Run production GREEN after Task 2 deploy and commit**

```bash
npm run test:e2e:multiplayer
git add playwright.multiplayer.config.mjs tests/e2e-multiplayer/helpers.mjs tests/e2e-multiplayer/live-2h2b.spec.mjs package.json
git commit -m "test: add production Tichu multiplayer E2E"
```

Expected: one live test passes; the initial authoritative state contains `discarded`; reconnect returns to the same room.

---

### Task 5: Add manual four-human and substitute-bot full smoke

**Repository:** `quendae/tichu`

**Files:**
- Modify: `tests/e2e-multiplayer/helpers.mjs`
- Create: `tests/e2e-multiplayer/full-4h.spec.mjs`
- Create: `tests/e2e-multiplayer/takeover.spec.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces `startWithoutBots(host)` and manual `npm run test:e2e:multiplayer:full`.

- [ ] **Step 1: Add no-bot start helper**

```js
export async function startWithoutBots(host){
  await host.page.locator('#mp-bots').uncheck();
  await expect(host.page.locator('#mp-start')).toBeEnabled();
  await host.page.locator('#mp-start').click();
  await expect.poll(()=>bridgeStatus(host).then(status=>status.active)).toBe(true);
}
```

- [ ] **Step 2: Create complete four-human smoke**

Create `tests/e2e-multiplayer/full-4h.spec.mjs`:

```js
import {test,expect} from '@playwright/test';
import {
  assertPrivateHands,attachDiagnostics,bridgeState,bridgeStatus,canonicalPublicSummary,cleanupClients,
  createPrivateRoom,driveHumanDecision,joinPrivateRoom,openE2EClient,runTag,startWithoutBots,
} from './helpers.mjs';

test('production QQND: four humans play with no bots',async({browser},testInfo)=>{
  const baseURL=testInfo.project.use.baseURL;
  if(typeof baseURL!=='string')throw new Error('missing_base_url');
  const tag=runTag(testInfo),nicknames=[1,2,3,4].map(n=>`E2E-${tag}-H${n}`),clients=[];
  let roomId=null,failed=false;
  try{
    for(let index=0;index<4;index++)clients.push(await openE2EClient(browser,baseURL,`H${index+1}`));
    roomId=await createPrivateRoom(clients[0],nicknames[0]);
    for(let index=1;index<4;index++)await joinPrivateRoom(clients[index],nicknames[index],roomId);
    await startWithoutBots(clients[0]);
    for(const client of clients)await expect.poll(()=>bridgeStatus(client).then(status=>status.active)).toBe(true);
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
    for(const client of clients)expect((await bridgeStatus(client)).botSeats).toEqual([]);
  }catch(error){failed=true;throw error}
  finally{
    if(failed)await attachDiagnostics(testInfo,clients,roomId,nicknames);
    const cleanupErrors=await cleanupClients(clients);
    if(cleanupErrors.length)await testInfo.attach('cleanup-errors',{body:cleanupErrors.join('\n'),contentType:'text/plain'});
  }
});
```

- [ ] **Step 3: Create complete 60-second takeover smoke**

Create `tests/e2e-multiplayer/takeover.spec.mjs`:

```js
import {test,expect} from '@playwright/test';
import {
  attachDiagnostics,bridgeStatus,canonicalBotSeats,cleanupClients,createPrivateRoom,driveHumanDecision,
  joinPrivateRoom,openE2EClient,runTag,startWithBots,
} from './helpers.mjs';

test('production QQND: disconnected human becomes substitute bot after grace',async({browser},testInfo)=>{
  const baseURL=testInfo.project.use.baseURL;
  if(typeof baseURL!=='string')throw new Error('missing_base_url');
  const tag=runTag(testInfo),nicknames=[`E2E-${tag}-H1`,`E2E-${tag}-H2`],clients=[];
  let roomId=null,failed=false;
  try{
    const h1=await openE2EClient(browser,baseURL,'H1');clients.push(h1);
    const h2=await openE2EClient(browser,baseURL,'H2');clients.push(h2);
    roomId=await createPrivateRoom(h1,nicknames[0]);
    await joinPrivateRoom(h2,nicknames[1],roomId);
    await startWithBots(h1);
    await expect.poll(()=>bridgeStatus(h2).then(status=>status.active)).toBe(true);

    const disconnectedSeat=(await bridgeStatus(h2)).seat;
    const revisionBefore=(await bridgeStatus(h1)).stateSeq;
    await h2.context.close();
    clients.splice(clients.indexOf(h2),1);

    await expect.poll(async()=>{
      const status=await bridgeStatus(h1);
      return status.presence.some(entry=>entry.seat===disconnectedSeat&&entry.botActive===true);
    },{timeout:75_000,interval:1_000}).toBe(true);

    await expect.poll(async()=>canonicalBotSeats(await bridgeStatus(h1)).includes(disconnectedSeat),{timeout:5_000}).toBe(true);

    const advanceDeadline=Date.now()+15_000;
    while(Date.now()<advanceDeadline&&(await bridgeStatus(h1)).stateSeq<=revisionBefore){
      await driveHumanDecision(h1);
      await new Promise(resolve=>setTimeout(resolve,200));
    }
    expect((await bridgeStatus(h1)).stateSeq).toBeGreaterThan(revisionBefore);
  }catch(error){failed=true;throw error}
  finally{
    if(failed)await attachDiagnostics(testInfo,clients,roomId,nicknames);
    const cleanupErrors=await cleanupClients(clients);
    if(cleanupErrors.length)await testInfo.attach('cleanup-errors',{body:cleanupErrors.join('\n'),contentType:'text/plain'});
  }
});
```

- [ ] **Step 4: Add manual full-smoke script**

Add to `package.json`:

```json
"test:e2e:multiplayer:full": "playwright test -c playwright.multiplayer.config.mjs tests/e2e-multiplayer/full-4h.spec.mjs tests/e2e-multiplayer/takeover.spec.mjs"
```

- [ ] **Step 5: Run once, record runtime, commit**

```bash
npm run test:e2e:multiplayer:full
git add tests/e2e-multiplayer/helpers.mjs tests/e2e-multiplayer/full-4h.spec.mjs tests/e2e-multiplayer/takeover.spec.mjs package.json
git commit -m "test: add full Tichu multiplayer smoke"
```

Record total runtime and takeover duration in the eventual PR body. The production gateway currently uses a 60,000 ms default reconnect grace, so this test remains outside every-push CI.

---

### Task 6: Wire bounded live coverage into CI and document it

**Repository:** `quendae/tichu`

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`

**Interfaces:**
- CI runs only `npm run test:e2e:multiplayer`.
- Full smoke stays explicit/manual.

- [ ] **Step 1: Add live multiplayer step after offline Playwright**

```yaml
      - run: npm run test:e2e
      - name: Live multiplayer E2E
        run: npm run test:e2e:multiplayer
```

- [ ] **Step 2: Upload both offline and live diagnostics**

Replace the existing upload block with:

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

- [ ] **Step 3: Add README section**

Add:

```md
### Multiplayer E2E

The bounded live E2E uses `wss://api.qqnd.fyi/api/v1/ws`, creates unique
private rooms, starts two isolated human browser sessions and fills the two
remaining seats with server bots.

```bash
npm run test:e2e:multiplayer
```

The heavier four-human + substitute-bot smoke is manual because production
uses a 60-second disconnect grace period:

```bash
npm run test:e2e:multiplayer:full
```

The test bridge exists only with `?e2e=1` and exposes only the viewer's
already-redacted state. Normal navigation does not install it. Failed runs
may leave private rooms/sessions until normal server TTL cleanup; tests never
modify rooms they did not create.
```

- [ ] **Step 4: Verify and commit CI/docs**

```bash
npm test
npx playwright test tests/e2e/e2e-bridge.spec.mjs --project=desktop-1440
npm run test:e2e:multiplayer
git add .github/workflows/ci.yml README.md
git commit -m "ci: run bounded Tichu multiplayer E2E"
```

Expected: all commands pass.

---

### Task 7: Final verification and PR handoff

**Repositories:** both.

**Files:**
- No new files unless verification exposes a defect.

**Interfaces:**
- Produces reviewable server/client PRs; server is merged/deployed before client live success is claimed.

- [ ] **Step 1: Re-run full server verification on the exact server head**

```bash
npm run typecheck && npm test && npm run build
```

Expected: exit 0.

- [ ] **Step 2: Verify deployed health**

```bash
curl -fsS https://api.qqnd.fyi/api/v1/health
```

Expected: `ok: true`. The `discarded` deployment claim still requires the Task 4 live state assertion.

- [ ] **Step 3: Run complete final Tichu verification**

```bash
npm test
npm run test:sim
npm run test:e2e
npm run test:e2e:multiplayer
npm run test:e2e:multiplayer:full
```

Record exact pass counts, expected skips and durations.

- [ ] **Step 4: Review production-boundary assertions**

Confirm each statement against the final diff:

```text
window.__tichuE2E is installed only for e2e=1.
Bridge status contains no session/resume token/sessionId.
Diagnostics contain only viewer-redacted states/public summaries.
All game actions use MultiplayerClient.action().
No test-only server endpoint exists.
All E2E rooms are private and uniquely named.
Default CI excludes the 60-second takeover smoke.
```

- [ ] **Step 5: Open Tichu PR after production live test is green**

PR title:

```text
Add production multiplayer E2E coverage
```

PR body includes:

```text
server prerequisite PR + deployed SHA
api.qqnd.fyi endpoint confirmation
offline unit/simulation/Playwright results
2H+2B live result + runtime
reconnect result
4-human result + runtime
60-second takeover result + runtime
private-room isolation statement
hidden-hand/credential safety statement
```

- [ ] **Step 6: Require a fresh PR-triggered CI run**

Confirm green PR checks for:

```text
npm test
npm run test:sim
npm run test:e2e
npm run test:e2e:multiplayer
```

A prior push run does not substitute for the PR run.

- [ ] **Step 7: Stop before client merge**

Report PR URL, exact head SHA, CI status, live result and full-smoke result. Do not merge the Tichu PR without explicit user approval.
