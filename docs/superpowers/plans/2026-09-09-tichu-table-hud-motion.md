# Tichu Table HUD and Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Tichu desktop table hierarchy with readable cards and seats, a collapsed top-bar menu, a movable Coach, live Dev UI tuning, and directional play/trick animations.

**Architecture:** Keep rules and multiplayer contracts unchanged. Store layout preferences in a focused UI-layout module, render stable seat/menu/Coach anchors in the DOM, and derive motion by comparing immutable projections of consecutive game states while the previous DOM still exists.

**Tech Stack:** Browser ES modules, DOM/CSS custom properties, Web Animations API, Node test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-09-tichu-table-hud-motion-design.md`

## Global Constraints

- Desktop opponent and played cards start at `96 × 142 px`; local cards start at `104 × 154 px`.
- Phone layouts retain independent compact values.
- Menu, Coach placement, and Dev UI remain presentation state and never enter game or multiplayer state.
- Motion never delays a game action and respects both the game animation setting and `prefers-reduced-motion`.
- Existing lacquer, felt, illustrated card art, Coach copy, keyboard access, and action contracts remain functional.
- No new runtime dependency is introduced.

---

### Task 1: Validated desktop layout preferences

**Files:**
- Create: `src/ui-layout.js`
- Modify: `src/ui-state.js`
- Create: `tests/ui-layout.test.mjs`
- Modify: `tests/ui-state.test.mjs`

**Interfaces:**
- Produces: `DESKTOP_UI_DEFAULTS`, `DEV_UI_CONTROLS`, `loadDesktopLayout(storage)`, `saveDesktopLayout(values, storage)`, `setDesktopLayoutValue(values, key, rawValue)`, `resetDesktopLayout(storage)`, `desktopLayoutCss(values)`, `clampCoachPosition(position, panelRect, boundsRect, safeBottom)`, `loadCoachPosition(storage)`, and `saveCoachPosition(position, storage)`.
- `createUiState(storage)` gains `menuOpen`, `devUiOpen`, `desktopLayout`, and `coachPosition`.

- [ ] **Step 1: Write failing layout preference tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DESKTOP_UI_DEFAULTS, loadDesktopLayout, setDesktopLayoutValue,
  desktopLayoutCss, clampCoachPosition,
} from '../src/ui-layout.js';

test('desktop tuning validates stored values and produces CSS variables', () => {
  const storage={getItem:()=>JSON.stringify({localCardWidth:112,opponentCardWidth:999}),setItem(){}};
  const values=loadDesktopLayout(storage);
  assert.equal(values.localCardWidth,112);
  assert.equal(values.opponentCardWidth,DESKTOP_UI_DEFAULTS.opponentCardWidth);
  assert.equal(desktopLayoutCss(values)['--local-card-width'],'112px');
});

test('Coach position is clamped inside table and above the safe bottom edge', () => {
  const result=clampCoachPosition({x:900,y:700},{width:350,height:220},{left:20,top:60,right:1180,bottom:820},170);
  assert.deepEqual(result,{x:830,y:430});
});
```

- [ ] **Step 2: Run the new tests and verify RED**

Run: `node --test tests/ui-layout.test.mjs`

Expected: FAIL because `src/ui-layout.js` does not exist.

- [ ] **Step 3: Implement the preference module**

```js
const LAYOUT_KEY='tichu.qqnd.desktop-layout.v1';
const COACH_POSITION_KEY='tichu.qqnd.coach-position.v1';

export const DESKTOP_UI_DEFAULTS=Object.freeze({
  localCardWidth:104,
  opponentCardWidth:96,
  localHandStep:72,
  opponentHandStep:34,
  badgeScale:100,
  playedCardStep:54,
  coachTextScale:100,
});

export const DEV_UI_CONTROLS=Object.freeze({
  localCardWidth:{label:'Karty gracza',min:92,max:124,step:1,unit:'px'},
  opponentCardWidth:{label:'Karty przeciwników i stołu',min:80,max:112,step:1,unit:'px'},
  localHandStep:{label:'Odstęp ręki gracza',min:48,max:84,step:1,unit:'px'},
  opponentHandStep:{label:'Odstęp wachlarzy przeciwników',min:22,max:48,step:1,unit:'px'},
  badgeScale:{label:'Skala plakietek',min:85,max:125,step:1,unit:'%'},
  playedCardStep:{label:'Odstęp kart na stole',min:34,max:72,step:1,unit:'px'},
  coachTextScale:{label:'Skala tekstu Coacha',min:85,max:130,step:1,unit:'%'},
});
```

Validate every value with `Number.isFinite`, the matching range, and step rounding. Parse storage in `try/catch`; return defaults for malformed input. `desktopLayoutCss()` returns only the seven documented variables. Coach position storage accepts finite `x` and `y` only.

- [ ] **Step 4: Extend `createUiState()` and verify GREEN**

```js
return {
  coachEnabled: stored===null ? true : stored!=='off',
  menuOpen:false,
  devUiOpen:false,
  desktopLayout:loadDesktopLayout(storage),
  coachPosition:loadCoachPosition(storage),
  // existing fields
};
```

Run: `node --test tests/ui-layout.test.mjs tests/ui-state.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit preference state**

```bash
git add src/ui-layout.js src/ui-state.js tests/ui-layout.test.mjs tests/ui-state.test.mjs
git commit -m "Add validated desktop UI preferences"
```

### Task 2: Collapsed top-bar menu and desktop Dev UI

**Files:**
- Modify: `index.html`
- Modify: `src/ui-render.js`
- Modify: `src/ui.js`
- Modify: `styles.css`
- Modify: `concept-polish.css`
- Modify: `tests/e2e/ui-smoke.spec.mjs`

**Interfaces:**
- Consumes: `uiState.menuOpen`, `uiState.devUiOpen`, `uiState.desktopLayout`, `DEV_UI_CONTROLS`, `desktopLayoutCss()`.
- Produces stable elements `#game-menu-button`, `#game-menu`, `#dev-ui-panel`, `[data-layout-key]`, `[data-action="copy-layout"]`, and `[data-action="reset-layout"]`.

- [ ] **Step 1: Write failing menu and Dev UI Playwright assertions**

Add a test that expects the left edge of `.table` to remain unobstructed, `#game-menu` to start hidden, all six actions to become visible after clicking `#game-menu-button`, Escape to close it, and a changed `localCardWidth` slider to alter `--local-card-width` and survive reload.

```js
await expect(page.locator('#game-menu')).toBeHidden();
await page.locator('#game-menu-button').click();
await expect(page.locator('#game-menu [data-action]')).toHaveCount(6);
await page.locator('[data-action="open-dev-ui"]').click();
await page.locator('[data-layout-key="localCardWidth"]').fill('112');
await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--local-card-width').trim())).toBe('112px');
await page.reload();
await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--local-card-width').trim())).toBe('112px');
```

- [ ] **Step 2: Run the targeted test and verify RED**

Run: `npx playwright test tests/e2e/ui-smoke.spec.mjs --project=desktop-1440 -g "menu and Dev UI"`

Expected: FAIL because `#game-menu-button` is missing.

- [ ] **Step 3: Replace the fixed menu markup**

Move the menu trigger into `.compact-actions`, replace the fixed `<nav class="table-menu">` with an initially hidden `<nav id="game-menu" class="game-menu">`, add `aria-controls="game-menu"` and `aria-expanded`, and remove `.table-quote` from `index.html`. Include the six actions listed in the spec.

- [ ] **Step 4: Render and handle disclosure state**

Add `renderMenu(uiState)` and `renderDevUi(uiState)` to `ui-render.js`. In `ui.js`, handle:

```js
if(action==='toggle-menu'){uiState.menuOpen=!uiState.menuOpen;render();return}
if(action==='open-dev-ui'){uiState.menuOpen=false;uiState.devUiOpen=true;render();return}
if(action==='close-dev-ui'){uiState.devUiOpen=false;render();return}
```

Use delegated `input` handling for `[data-layout-key]`, call `setDesktopLayoutValue`, persist, apply `desktopLayoutCss()` to `document.documentElement.style`, and render numeric outputs. Copy JSON with `navigator.clipboard.writeText`; always mirror the JSON into `#layout-export`.

- [ ] **Step 5: Add top-bar popover and Dev UI drawer styling**

Delete the fixed-left menu rules and `nth-of-type` hiding. Anchor `.game-menu` below the top-right trigger with the existing lacquer/brass material language. Dev UI uses a right drawer with labelled range rows and 36 px minimum controls. Under `max-width:900px`, disable ranges and show `.dev-mobile-note`.

- [ ] **Step 6: Verify menu and Dev UI GREEN**

Run: `npx playwright test tests/e2e/ui-smoke.spec.mjs --project=desktop-1440 -g "menu and Dev UI"`

Expected: PASS with no horizontal overflow.

- [ ] **Step 7: Commit HUD disclosure**

```bash
git add index.html src/ui-render.js src/ui.js styles.css concept-polish.css tests/e2e/ui-smoke.spec.mjs
git commit -m "Collapse game menu and add desktop UI tuning"
```

### Task 3: Movable desktop Coach

**Files:**
- Modify: `src/ui-layout.js`
- Modify: `src/ui-render.js`
- Modify: `src/ui.js`
- Modify: `styles.css`
- Modify: `tests/ui-layout.test.mjs`
- Modify: `tests/e2e/ui-smoke.spec.mjs`

**Interfaces:**
- Consumes: `clampCoachPosition()`, `loadCoachPosition()`, `saveCoachPosition()`.
- Produces: `.coach-drag-handle`, `[data-action="reset-coach-position"]`, `applyCoachPosition(panel, position)`, and pointer-drag behavior.

- [ ] **Step 1: Add failing clamping and drag tests**

Extend unit coverage for negative coordinates, resized bounds, and an oversized panel. Add Playwright coverage that drags `.coach-drag-handle`, verifies the panel moved, stays inside `.table`, persists after reload, and returns to its default anchor after reset.

```js
const before=await page.locator('#coach-panel').boundingBox();
await page.locator('.coach-drag-handle').dragTo(page.locator('.felt-dragon'),{targetPosition:{x:120,y:100}});
const after=await page.locator('#coach-panel').boundingBox();
expect(after.x).not.toBe(before.x);
await page.reload();
expect((await page.locator('#coach-panel').boundingBox()).x).toBeCloseTo(after.x,0);
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/ui-layout.test.mjs && npx playwright test tests/e2e/ui-smoke.spec.mjs --project=desktop-1440 -g "movable Coach"`

Expected: unit boundary case or missing `.coach-drag-handle` fails.

- [ ] **Step 3: Add a stable Coach window header**

Render the handle before `.coach-copy`:

```html
<div class="coach-window-head">
  <button class="coach-drag-handle" type="button" aria-label="Przenieś Coacha">🎓 COACH TICHU</button>
  <button data-action="reset-coach-position" type="button" aria-label="Przywróć pozycję Coacha">↺</button>
</div>
```

Do not put changing tutorial text inside the handle.

- [ ] **Step 4: Implement pointer dragging and persistence**

On pointer down, record `pointerId`, the panel rectangle, and pointer offset. On pointer move, call `clampCoachPosition()` against `.table.getBoundingClientRect()`, assign `left/top/right/bottom/transform`, and update `uiState.coachPosition`. On pointer up/cancel, release capture and call `saveCoachPosition()`.

`applyCoachPosition()` ignores saved position under `max-width:680px`, where CSS keeps Coach docked above the local hand. Reset clears storage and inline positioning.

- [ ] **Step 5: Verify Coach GREEN and commit**

Run: `node --test tests/ui-layout.test.mjs`

Run: `npx playwright test tests/e2e/ui-smoke.spec.mjs --project=desktop-1440 -g "movable Coach"`

Expected: PASS.

```bash
git add src/ui-layout.js src/ui-render.js src/ui.js styles.css tests/ui-layout.test.mjs tests/e2e/ui-smoke.spec.mjs
git commit -m "Make the desktop Coach movable"
```

### Task 4: Unified desktop card and seat geometry

**Files:**
- Modify: `src/ui-render.js`
- Modify: `styles.css`
- Modify: `concept-polish.css`
- Modify: `tests/e2e/ui-smoke.spec.mjs`

**Interfaces:**
- Consumes CSS variables from `desktopLayoutCss()`.
- Produces `data-card-zone="local|opponent|table"`, `--played-count`, centered seat anchors, and a dedicated `.play-caption` row.

- [ ] **Step 1: Write failing desktop geometry tests**

At `2542 × 1283`, create deterministic 14-card hands and table groups of 1, 2, 5, and 8 cards. Assert:

```js
expect(opponentWidths).toEqual([96,96,96]);
expect(tableCardWidth).toBe(96);
expect(localCardWidth).toBe(104);
expect(Math.abs(topBadgeCenter-tableCenter)).toBeLessThanOrEqual(2);
expect(Math.abs(leftInset-rightInset)).toBeLessThanOrEqual(2);
expect(overlaps(playCaption,tableCards)).toBe(false);
```

Also retain full-hand viewport bounds and card-corner/art separation checks.

- [ ] **Step 2: Run geometry tests and verify RED**

Run: `npx playwright test tests/e2e/ui-smoke.spec.mjs --project=desktop-1440 -g "desktop card geometry"`

Expected: FAIL because opponents are `51–52 px`, table cards are `60 px`, and side anchors are asymmetric.

- [ ] **Step 3: Add stable card zones and played-count metadata**

In `renderSeat()`, set the hand zone and keep card backs at the shared opponent size. In `playGroupHTML()`, stop passing `{small:true}`, set `data-card-zone="table"`, and add `style="--play-index:${index};--played-count:${entry.cards.length}"`.

- [ ] **Step 4: Replace hard-coded desktop geometry with tokens**

Define derived dimensions:

```css
:root{
  --local-card-width:104px;
  --opponent-card-width:96px;
  --card-ratio:1.48077;
  --local-card-height:calc(var(--local-card-width) * var(--card-ratio));
  --opponent-card-height:calc(var(--opponent-card-width) * var(--card-ratio));
}
.player-hand{--card-width:var(--local-card-width);--card-height:var(--local-card-height)}
.opponent-hand-top,.opponent-hand-side,.played-cards{--card-width:var(--opponent-card-width);--card-height:var(--opponent-card-height)}
```

Center every seat through a consistent seat axis. Let side-hand height span the usable table height and compute overlap from `--opponent-hand-step`. Reserve caption space below `.played-cards`; calculate group width using `--played-card-step` and `--played-count`.

- [ ] **Step 5: Preserve independent mobile geometry**

Inside `max-width:680px` and short-landscape media queries, set explicit compact card tokens, hand steps, badge sizes, table-card size, and Coach docking. Remove conflicting duplicate values from `concept-polish.css`.

- [ ] **Step 6: Verify geometry GREEN and commit**

Run: `npx playwright test tests/e2e/ui-smoke.spec.mjs --project=desktop-1440 -g "desktop card geometry"`

Expected: PASS at the checked-in defaults and after changing Dev UI values within supported ranges.

```bash
git add src/ui-render.js styles.css concept-polish.css tests/e2e/ui-smoke.spec.mjs
git commit -m "Unify desktop card and seat geometry"
```

### Task 5: State-derived play and trick motion

**Files:**
- Create: `src/ui-motion.js`
- Modify: `src/ui-interactions.js`
- Modify: `src/ui.js`
- Modify: `src/ui-render.js`
- Create: `tests/ui-motion.test.mjs`
- Modify: `tests/e2e/materials.spec.mjs`

**Interfaces:**
- Produces: `snapshotVisualState(state)`, `deriveVisualTransitions(previous, next)`, `captureTransitionSources(transitions)`, and `runVisualTransitions(transitions, sources, options)`.
- Transition union:

```js
// {kind:'play',seat:number,cardIds:string[]}
// {kind:'collect',recipient:number,cardIds:string[]}
// {kind:'play-and-collect',seat:number,recipient:number,cardIds:string[],tableCardIds:string[]}
```

- [ ] **Step 1: Write failing pure transition tests**

Cover a local play, each bot seat, a multi-card play, a normal collection, Dragon collection to an opponent, Dog clearing with no capture, no-op selection renders, and the final play that is collected before an intermediate table render.

```js
const transitions=deriveVisualTransitions(previous,next);
assert.deepEqual(transitions,[{kind:'collect',recipient:3,cardIds:['dragon','jade-10']}]);
```

- [ ] **Step 2: Run transition tests and verify RED**

Run: `node --test tests/ui-motion.test.mjs`

Expected: FAIL because `src/ui-motion.js` does not exist.

- [ ] **Step 3: Implement immutable snapshots and ID differences**

`snapshotVisualState()` copies arrays and IDs; it never retains mutable state arrays. `deriveVisualTransitions()` identifies new table entries from card IDs, recipient seats from captured-card differences, and ignores clears where no captured set grows. When hand loss and capture growth occur in one state change with no new table entry, emit `play-and-collect`.

- [ ] **Step 4: Verify pure logic GREEN**

Run: `node --test tests/ui-motion.test.mjs`

Expected: PASS.

- [ ] **Step 5: Add geometry capture and testable animation clones**

Before render, capture exact local card rectangles or the exposed edge of the acting opponent hand, plus visible table-card rectangles for collection. After render, resolve `#table-pile` or `targetElementForSeat(recipient)` and animate clones.

Every clone includes:

```js
clone.dataset.motionKind=transition.kind;
clone.dataset.motionSeat=String(transition.seat??transition.recipient);
clone.dataset.motionDestination=transition.kind==='play'?'table':`seat-${transition.recipient}`;
```

Multi-card plays use a 35 ms stagger. Collection clones converge with a slight scale-down. Remove clones on finish/cancel. Return immediately when animations are disabled or reduced motion is active.

- [ ] **Step 6: Integrate around the render boundary**

Replace manual `animateSelectedToPile()` calls with:

```js
let visualSnapshot=snapshotVisualState(game.state);
function render(next=game.state){
  const nextSnapshot=snapshotVisualState(next);
  const transitions=deriveVisualTransitions(visualSnapshot,nextSnapshot);
  const sources=captureTransitionSources(transitions);
  syncUiState(uiState,next);
  renderAll(next,uiState,buildCoachModel(next,uiState));
  runVisualTransitions(transitions,sources,{enabled:next.settings?.animations!==false});
  visualSnapshot=nextSnapshot;
  logFeedback(next);
}
```

Update the initial bootstrap snapshot after `resetMatch()` so the first deal is not treated as a play.

- [ ] **Step 7: Write and run Playwright motion tests**

Instrument Web Animations API in the page to retain clone metadata and keyframes. Assert local and bot source regions, all cards in a combination, collection destination, Dragon recipient, no Dog collection, disabled motion, and reduced motion.

Run: `npx playwright test tests/e2e/materials.spec.mjs --project=desktop-1440 -g "motion"`

Expected: PASS without timing-dependent sleeps.

- [ ] **Step 8: Commit motion controller**

```bash
git add src/ui-motion.js src/ui-interactions.js src/ui.js src/ui-render.js tests/ui-motion.test.mjs tests/e2e/materials.spec.mjs
git commit -m "Animate plays and collected tricks by seat"
```

### Task 6: Full responsive playtest and final polish

**Files:**
- Modify if failures require it: `styles.css`
- Modify if failures require it: `concept-polish.css`
- Modify if a regression assertion is missing: `tests/e2e/ui-smoke.spec.mjs`
- Modify if a regression assertion is missing: `tests/e2e/materials.spec.mjs`

**Interfaces:**
- Consumes all prior tasks.
- Produces a verified, reviewable branch with screenshot evidence.

- [ ] **Step 1: Run all unit tests**

Run: `npm test`

Expected: all tests pass with no failures.

- [ ] **Step 2: Run all Playwright projects**

Run: `npx playwright test`

Expected: all tests pass for `desktop-1440`, `phone-360`, and `phone-landscape`.

- [ ] **Step 3: Capture large-desktop and representative gameplay screenshots**

Capture `2542 × 1283`, `1440 × 900`, `360 × 800`, and `800 × 360` for Grand Tichu, exchange, a multi-card trick, and a dragged Coach with Dev UI open.

- [ ] **Step 4: Review screenshots against the spec**

Confirm card hierarchy, symmetric seats, caption separation, menu disclosure, Coach bounds, mobile playfield clearance, and visible directional motion endpoints. If a visual defect is found, add the smallest failing geometry assertion before changing CSS.

- [ ] **Step 5: Run final verification**

Run: `git diff --check`

Run: `npm test`

Run: `npx playwright test`

Expected: clean diff check and all tests green.

- [ ] **Step 6: Commit final responsive adjustments**

```bash
git add styles.css concept-polish.css tests/e2e/ui-smoke.spec.mjs tests/e2e/materials.spec.mjs
git commit -m "Polish responsive table hierarchy"
```

- [ ] **Step 7: Publish and integrate**

Push `feature/table-hud-motion`, open a PR describing final behavior and validation, wait for GitHub CI, then squash-merge after CI succeeds under the user's standing Git authorization.

