# Tichu Dynamic Table, Beginner Coach, and Illustrated Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace blocking gameplay popups with fluid in-table interactions, add a beginner Coach powered by the real rules engine, and give the Tichu deck a distinctive illustrated vector-card treatment that remains playable on phone, tablet, and desktop.

**Architecture:** Keep `TichuGame` and the multiplayer action contract authoritative for real game actions. Add client-only staging state for exchange/wish/coach interactions, derive all Coach legality from `rules.js`, and split the current monolithic UI into small rendering/interaction helpers. Card art is deterministic inline SVG metadata so it loads instantly with no external dependency and can later be replaced with exported art without changing the card component API.

**Tech Stack:** Browser ES modules, DOM/CSS, Node `node:test`, existing QQND WebSocket multiplayer client, Figma/Canva for visual direction.

**Spec:** `docs/superpowers/specs/2026-09-07-tichu-ux-beginner-coach-design.md`

## Global Constraints

- Keep the current static-browser architecture and ES modules; do not add a framework or bundler.
- Do not change the QQND multiplayer protocol unless an actual contract bug is found.
- Coach is enabled by default for new sessions and is user-toggleable.
- Coach may use only the player's visible state and must never depend on hidden opponent information.
- Exchange is staged client-side and still submits the existing `{ map }` action payload.
- Grand Tichu, exchange, Mah Jong wish, and Dragon recipient choices must no longer use a full-screen blocking backdrop.
- Rules, Log, and Online remain secondary drawers/panels.
- Illustrated cards must preserve rank/suit readability and have a text/symbol fallback.
- Full 14-card hands must remain reachable on phone portrait without clipping.

---

### Task 1: Harden rule edge cases and expose coach-friendly rule helpers

**Files:**
- Modify: `src/rules.js`
- Modify: `tests/rules.test.mjs`

**Interfaces:**
- Consumes: existing `classify(cards, previousSingleValue)`, `beats(play, previous)`, `possibleSelections(hand, previous, wishRank)`.
- Produces: `describePlay(play) -> string`, `legalCardIds(hand, previous, wishRank) -> Set<string>`, and corrected Mah Jong/Phoenix combination legality.

- [ ] **Step 1: Add failing regression tests for Mah Jong and Phoenix**

Add tests that assert `[mahjong, phoenix]` cannot form a pair, Mah Jong cannot participate in steps/full houses, and Phoenix may fill a normal straight rank but never impersonate rank 1/Mah Jong.

- [ ] **Step 2: Run the rule tests and verify the new Mah Jong assertion fails**

Run: `npm test`

Expected: at least the new `[mahjong, phoenix]` regression fails against the current classifier.

- [ ] **Step 3: Correct classifier restrictions**

Implement these rules in `src/rules.js`:

```js
const hasMahjong = cards => cards.some(c=>c.special==='mahjong');

function sameRankWithPhoenix(cards,wanted){
  if(cards.length!==wanted || forbiddenCombo(cards) || hasMahjong(cards) || phoenixCount(cards)>1) return null;
  // existing same-rank logic
}

function stepsInfo(cards){
  if(cards.length<4 || cards.length%2 || forbiddenCombo(cards) || hasMahjong(cards) || phoenixCount(cards)>1) return null;
  // existing steps logic
}

function fullHouseInfo(cards){
  if(cards.length!==5 || forbiddenCombo(cards) || hasMahjong(cards) || phoenixCount(cards)>1) return null;
  // existing full-house logic
}
```

For straights, permit Mah Jong only when the real Mah Jong card supplies rank 1. Phoenix may fill exactly one missing rank, but reject candidates where `missing[0] === 1`.

- [ ] **Step 4: Add coach-facing descriptors and legal-card derivation**

Add exports:

```js
export function describePlay(play){
  if(!play) return 'invalid selection';
  const rank = value => ({11:'jack',12:'queen',13:'king',14:'ace'})[value] || String(value);
  if(play.type==='single') return `single ${rank(Math.floor(play.value))}`;
  if(play.type==='pair') return `pair of ${rank(play.value)}s`;
  if(play.type==='triple') return `triple ${rank(play.value)}s`;
  if(play.type==='full-house') return `full house, ${rank(play.value)}s high`;
  if(play.type==='steps') return `consecutive pairs to ${rank(play.value)}`;
  if(play.type==='straight') return `straight to ${rank(play.value)}`;
  if(play.type==='bomb') return play.bomb.kind==='four'
    ? `four-of-a-kind bomb, ${rank(play.value)}s`
    : `${play.length}-card straight-flush bomb to ${rank(play.value)}`;
  return play.type;
}

export function legalCardIds(hand,previous=null,wishRank=null){
  const options=possibleSelections(hand,previous,wishRank);
  const mustFulfill=!!wishRank && options.some(option=>option.fulfills);
  const ids=new Set();
  for(const option of options){
    if(mustFulfill && !option.fulfills) continue;
    option.cards.forEach(card=>ids.add(card.id));
  }
  return ids;
}
```

- [ ] **Step 5: Add tests for `describePlay` and `legalCardIds`**

Cover a pair response, a straight, a bomb, and a wish where only cards belonging to wish-fulfilling options are highlighted.

- [ ] **Step 6: Run all tests**

Run: `npm test`

Expected: all rule tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/rules.js tests/rules.test.mjs
git commit -m "fix: harden Tichu rules for coach guidance"
```

---

### Task 2: Add isolated client UI state for inline decisions and exchange staging

**Files:**
- Create: `src/ui-state.js`
- Create: `tests/ui-state.test.mjs`

**Interfaces:**
- Produces: `createUiState()`, `syncUiState(ui,state)`, `assignExchangeCard(ui,targetSeat,cardId)`, `unassignExchangeTarget(ui,targetSeat)`, `exchangeMap(ui)`, `exchangeComplete(ui)`.
- Consumed by: `src/ui.js`, `src/ui-render.js`, `src/ui-interactions.js`.

- [ ] **Step 1: Write failing staging tests**

Test initial defaults and a full assignment/undo cycle:

```js
const ui=createUiState();
assert.equal(ui.coachEnabled,true);
assert.deepEqual(ui.exchangeAssignments,{});
assignExchangeCard(ui,1,'jade-2');
assignExchangeCard(ui,2,'dragon');
assignExchangeCard(ui,3,'star-8');
assert.equal(exchangeComplete(ui),true);
unassignExchangeTarget(ui,2);
assert.equal(exchangeComplete(ui),false);
```

Also verify assigning one card to a second target automatically removes its first assignment so a card cannot be duplicated.

- [ ] **Step 2: Run the new test and verify it fails because the module does not exist**

Run: `node --test tests/ui-state.test.mjs`

Expected: module-not-found failure.

- [ ] **Step 3: Implement `src/ui-state.js`**

Use a plain object, not a second event system:

```js
const COACH_KEY='tichu.qqnd.coach.v1';

export function createUiState(storage=globalThis.localStorage){
  const stored=storage?.getItem?.(COACH_KEY);
  return {
    coachEnabled: stored===null ? true : stored!=='off',
    hintCardIds:new Set(),
    exchangeAssignments:{},
    exchangeTarget:1,
    wishPicker:false,
    dragonChoice:false,
    transientSeatFeedback:{},
    lastPhase:null,
  };
}
```

`syncUiState` resets exchange staging when entering a new round/exchange and clears wish/dragon transient flags when the authoritative state no longer requires them.

- [ ] **Step 4: Add persistence helper**

Export `setCoachEnabled(ui,enabled,storage=globalThis.localStorage)` and store `on`/`off` safely behind optional chaining so Node tests do not require a DOM.

- [ ] **Step 5: Run UI-state tests**

Run: `node --test tests/ui-state.test.mjs`

Expected: PASS.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/ui-state.js tests/ui-state.test.mjs
git commit -m "feat: add inline Tichu UI state"
```

---

### Task 3: Build the beginner Coach from real legal moves

**Files:**
- Create: `src/coach.js`
- Create: `tests/coach.test.mjs`
- Modify: `src/rules.js` only if a descriptor needs a small pure helper adjustment

**Interfaces:**
- Consumes: `possibleSelections`, `describePlay`, `classify`, `beats`.
- Produces: `buildCoachModel(gameState, uiState) -> { title, body, legalCardIds:Set, optionCount, selectedLabel, selectedValid, hintCardIds:Set }` and `specialCardHelp(card) -> {title,body}`.

- [ ] **Step 1: Write failing Coach tests**

Cover at least:

```js
assert.match(buildCoachModel(openingState,ui).body,/lead/i);
assert.match(buildCoachModel(pairResponseState,ui).body,/higher pair|bomb/i);
assert.match(buildCoachModel(wishState,ui).body,/must.*7/i);
assert.equal(buildCoachModel(exchangeState,ui).title,'Pass a card to Mei');
```

Also assert Coach does not inspect or reference actual values from `hands[1]`, `hands[2]`, or `hands[3]` in its message.

- [ ] **Step 2: Run Coach tests and verify module-not-found failure**

Run: `node --test tests/coach.test.mjs`

Expected: FAIL because `src/coach.js` does not exist.

- [ ] **Step 3: Implement Coach derivation**

`buildCoachModel` should:
1. return exchange guidance when `phase==='exchange'`;
2. return Grand guidance when `phase==='grand'`;
3. during play, derive legal options from `possibleSelections(state.hands[0],state.lastPlay,state.wish)`;
4. if any option fulfills an active wish, filter the legal set to wish-fulfilling options for highlights/hints;
5. describe current selected cards via `classify`;
6. choose a hint by preferring the lowest non-bomb legal move, then the lowest bomb only when no non-bomb is available.

- [ ] **Step 4: Implement special-card help**

Return concise copy:

```js
mahjong: 'Rank 1. When you play it, you may wish for a normal rank from 2 to Ace.'
dog: 'Lead it alone. The trick ends immediately and the lead passes to your partner.'
phoenix: 'Wildcard in most combinations. As a single it is half a rank above the previous single. Worth -25 points.'
dragon: 'Highest single and worth +25 points. If it wins the trick, give that trick to one opponent.'
```

- [ ] **Step 5: Run Coach tests and whole suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/coach.js tests/coach.test.mjs src/rules.js
git commit -m "feat: add beginner Coach guidance"
```

---

### Task 4: Create illustrated vector-card metadata with no external runtime dependency

**Files:**
- Create: `src/card-art.js`
- Create: `tests/card-art.test.mjs`
- Later consumed by: `src/ui-render.js`

**Interfaces:**
- Produces: `cardArt(card) -> { className, ariaLabel, svg, accent, label }`.

- [ ] **Step 1: Write failing art metadata tests**

Verify all 56 deck cards produce non-empty `ariaLabel`, `label`, and safe SVG strings, and that the four special cards return unique illustration keys.

- [ ] **Step 2: Run and verify module-not-found failure**

Run: `node --test tests/card-art.test.mjs`

Expected: FAIL.

- [ ] **Step 3: Implement normal-suit motifs**

Use tiny deterministic inline SVG illustrations with `viewBox="0 0 100 140"`:
- Jade: bamboo stems/leaves and a jade-disc circle motif.
- Swords: crossed blade silhouettes and tassel lines.
- Pagodas: layered roof lines and a small moon/sun disc.
- Stars: constellation dots/lines and a crescent arc.

Keep the motif in the middle/lower portion so the rank corner stays readable.

- [ ] **Step 4: Implement unique special-card illustrations**

Use distinct SVG compositions:
- Mah Jong: sunrise disc + winding path + tile glyph.
- Dog: guardian-dog silhouette made from circles/curves.
- Phoenix: feathered wing arcs around a flame body.
- Dragon: serpentine S-curve body with head/horns and cloud curls.

These are original QQND vector motifs, not copied official Tichu art.

- [ ] **Step 5: Run tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/card-art.js tests/card-art.test.mjs
git commit -m "feat: add illustrated vector card art"
```

---

### Task 5: Replace gameplay modals with inline table rendering

**Files:**
- Create: `src/ui-render.js`
- Modify: `src/ui.js`
- Modify: `index.html`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `TichuGame`, `MultiplayerClient`, UI state helpers, Coach model, `cardArt`.
- Produces DOM hooks: `#context-panel`, `#coach-panel`, `#wish-bar`, `#round-summary`, seat targets with `data-seat-target`, exchange chips with `data-exchange-target`.

- [ ] **Step 1: Add stable DOM anchors in `index.html`**

Inside `.center`, add:

```html
<div id="context-panel" class="context-panel" aria-live="polite"></div>
<div id="wish-bar" class="wish-bar hidden"></div>
<div id="round-summary" class="round-summary hidden"></div>
```

Inside the bottom seat or directly above the hand, add:

```html
<div id="coach-panel" class="coach-panel" aria-live="polite"></div>
```

Keep `#modal-root` only for Rules/Online compatibility if their existing code requires it; gameplay flow must not write a `.modal-backdrop` into it.

- [ ] **Step 2: Implement `ui-render.js` card renderer**

Create `cardHTML(card, options)` using `cardArt(card)` and accessible button semantics for clickable cards. Normal/special cards render an `.art-layer` SVG plus large corner rank/suit.

- [ ] **Step 3: Implement all four visible hands**

Render hidden card backs for seats 1, 2, and 3. Side seats use a compact vertical/fanned class instead of omitting their hands.

- [ ] **Step 4: Implement inline Grand decision**

When local Grand is undecided, `#context-panel` renders:

```html
<div class="decision-ribbon grand-ribbon">
  <div><b>Grand Tichu?</b><small>First 8 cards only · ±200</small></div>
  <button data-inline="grand-pass">Pass</button>
  <button data-inline="grand-call">Grand Tichu +200</button>
</div>
```

- [ ] **Step 5: Implement inline exchange flow**

Render three recipient chips around/in the center. The active target gets `.exchange-target-active`. Assigned cards render face-down miniature cards with an undo button. `Confirm exchange` only enables when all targets are assigned.

- [ ] **Step 6: Implement inline Mah Jong wish bar**

Render rank buttons `2`…`A` plus `No wish` only while the UI state's wish picker is active. Playing a Mah Jong selection opens this bar instead of submitting immediately.

- [ ] **Step 7: Implement clickable Dragon recipients**

When `state.dragonRecipient==='needed'`, seats 1 and 3 get `.dragon-target` and `data-seat-target`. Clicking one sends/executes the existing Dragon action.

- [ ] **Step 8: Implement in-table round/match summary**

Replace blocking end-state modal calls with `#round-summary` content and `Next round` / `New match` buttons.

- [ ] **Step 9: Remove gameplay modal triggers from `render()`**

The final render path must no longer call `showGrand()`, `showExchange()`, `showRoundEnd()`, `showMatchEnd()`, `showDragonChoice()`, or `showWish()`.

- [ ] **Step 10: Run tests**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 11: Commit**

```bash
git add index.html styles.css src/ui.js src/ui-render.js
git commit -m "feat: move Tichu decisions onto the table"
```

---

### Task 6: Wire direct-from-hand exchange, Coach controls, hints, and inline actions

**Files:**
- Create: `src/ui-interactions.js`
- Modify: `src/ui.js`
- Modify: `src/ui-render.js`
- Modify: `styles.css`

**Interfaces:**
- Consumes: UI staging state + rendering hooks from Tasks 2 and 5.
- Produces: direct card-to-recipient exchange, Coach toggle/hint, inline Grand/wish/Dragon/summary actions.

- [ ] **Step 1: Route card clicks by phase**

Card clicks behave as follows:
- `phase==='exchange'`: assign the clicked card to `ui.exchangeTarget`, then advance to the next unassigned target.
- `phase==='play'`: toggle real game selection via `game.select(cardId)`.
- other phases: no card-selection action.

- [ ] **Step 2: Implement exchange undo and target selection**

Clicking a recipient chip selects that target. Clicking an assigned mini-card removes that assignment and sets the corresponding target active.

- [ ] **Step 3: Submit the existing exchange map**

On `data-inline="exchange-confirm"`:

```js
const map=exchangeMap(ui);
if(mp.active) mp.action('exchange',{map});
else if(!game.submitExchange(0,map)) toast('Invalid exchange.');
```

Do not invent a new multiplayer message.

- [ ] **Step 4: Wire Coach toggle and Hint**

`Coach` toggle calls `setCoachEnabled`. `Hint` copies the hint option's card IDs into `ui.hintCardIds`; rendering uses `.hinted` but does not call `game.select` and never auto-plays.

- [ ] **Step 5: Wire inline Grand, wish, Dragon, next-round, and new-match actions**

Reuse exactly the existing `runAction` action names and payloads: `grand`, `play`, `dragon`, `next-round`, `new-match`.

- [ ] **Step 6: Add keyboard/accessibility behavior**

Clickable cards and recipient targets must be keyboard-focusable buttons or elements with button semantics. `Escape` closes the wish bar or clears a transient hint, but must not silently cancel authoritative actions.

- [ ] **Step 7: Run tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/ui.js src/ui-interactions.js src/ui-render.js styles.css
git commit -m "feat: add fluid Tichu table interactions"
```

---

### Task 7: Polish animations, responsive hand layout, side hands, and mobile navigation

**Files:**
- Modify: `styles.css`
- Modify: `index.html`
- Modify: `src/ui-render.js`
- Modify: `src/ui.js`

**Interfaces:**
- Consumes DOM classes/state from Tasks 5–6.
- Produces responsive layouts and visual feedback only; no rule changes.

- [ ] **Step 1: Replace fixed overlap with CSS-variable hand compression**

Give `.hand` an inline `--card-count` and use viewport-aware negative overlap so 14 cards fit. The small-screen rule should cap total hand width to the available seat width rather than hardcoding `margin-left:-27px`.

A practical CSS pattern:

```css
.hand{--card-w:74px;--spread:52px;display:flex;justify-content:center}
.hand .card + .card{margin-left:calc((var(--card-w) - var(--spread)) * -1)}
@media(max-width:600px){
  .hand{--card-w:52px;--spread:clamp(20px,calc((100vw - 86px)/13),30px)}
}
```

- [ ] **Step 2: Add side-hand fans**

Left/right hidden hands use vertical overlap and slight rotation. Keep them behind badges and away from the center action region.

- [ ] **Step 3: Add transition classes**

Implement lightweight CSS animations:
- `.card-play-enter`
- `.exchange-fly`
- `.seat-pass-flash`
- `.trick-collect`
- `.exchange-target-active`
- `.dragon-target`

Respect `@media (prefers-reduced-motion: reduce)` by disabling travel animations.

- [ ] **Step 4: Keep Log, Rules, and Online reachable on mobile**

Remove the current `@media(max-width:900px){.top-actions .ghost{display:none}}` behavior. Replace it with compact labels/icons or an overflow action strip so the functions remain reachable.

- [ ] **Step 5: Make Coach mobile-safe**

On narrow portrait, Coach becomes a compact two-line strip above the hand. Hint/toggle controls stay at least 40px high and never overlap cards.

- [ ] **Step 6: Verify CSS syntax and run unit suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add styles.css index.html src/ui.js src/ui-render.js
git commit -m "style: polish responsive Tichu table motion"
```

---

### Task 8: Add randomized bot-game regression coverage and documentation

**Files:**
- Create: `tests/simulation.test.mjs`
- Modify: `README.md`
- Create: `docs/design/tichu-visual-direction.md`

**Interfaces:**
- Consumes: `TichuGame` local engine and final UI/design references.
- Produces: repeatable automated smoke coverage for full local rounds and human-readable links to Figma/Canva direction.

- [ ] **Step 1: Add deterministic local-game simulation smoke test**

Instantiate a game with zero bot delay or drive the pure engine using bot methods, and run many rounds with a maximum action guard. The test must fail if a game becomes stuck in `grand`, `exchange`, or `play` with no legal progression.

Target at least 200 completed rounds in CI if runtime remains reasonable; otherwise use 50 in CI and a documented `SIM_ROUNDS=500` local override.

- [ ] **Step 2: Add assertions for round completion**

For each simulated round verify:
- 56 unique cards were dealt/used;
- no hand has duplicate IDs;
- a round reaches `round-end` or `match-end` within the action guard;
- total match scores remain finite integers.

- [ ] **Step 3: Update README**

Document:
- Coach ON/OFF behavior;
- direct hand-based exchange;
- illustrated card treatment;
- local run command;
- multiplayer remains compatible with the QQND server.

- [ ] **Step 4: Add visual-direction document**

Record the Figma file URL and Canva design URL/candidate chosen during the implementation, plus the visual rules: green felt, wood/gold accents, ink/wash card art, and mobile readability priority.

- [ ] **Step 5: Run full verification**

Run: `npm test`

Expected: all unit and simulation tests pass.

- [ ] **Step 6: Commit**

```bash
git add tests/simulation.test.mjs README.md docs/design/tichu-visual-direction.md
git commit -m "test: add Tichu gameplay regression coverage"
```

---

### Task 9: Final integration review and pull request

**Files:**
- Review all files changed on `feature/ux-coach-illustrated-cards`.

**Interfaces:**
- Produces: reviewable PR with green CI and no known blocker.

- [ ] **Step 1: Run the full test suite from a clean dependency state**

Run: `npm test`

Expected: PASS.

- [ ] **Step 2: Review diff for accidental protocol changes**

Confirm `src/multiplayer.js` action names/payloads remain compatible and no hidden-state data is used by `src/coach.js`.

- [ ] **Step 3: Inspect mobile-specific CSS for clipping risks**

Check all breakpoint rules for the 14-card hand, side hands, Coach strip, and top actions. Confirm no rule hides Log/Rules/Online.

- [ ] **Step 4: Create PR**

Title: `Make Tichu table fluid and beginner-friendly`

Body must summarize:
- inline exchange / Grand / wish / Dragon flows;
- Beginner Coach;
- illustrated vector cards;
- side hands + responsive/mobile fixes;
- rule regressions fixed;
- test/simulation coverage;
- Figma/Canva references.

- [ ] **Step 5: Wait for CI result and fix any failures before merge**

Only merge after required GitHub Actions checks complete successfully.
