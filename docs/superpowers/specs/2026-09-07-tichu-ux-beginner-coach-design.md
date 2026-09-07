# Tichu UX Refresh, Beginner Coach, and Illustrated Cards

## Summary

This document defines the next UX and presentation pass for `quendae/tichu`. The goals are to remove blocking game-flow popups, make card exchange and special-card decisions happen directly on the table, add a beginner-friendly coaching mode, and replace the current mostly typographic card treatment with a more illustrated and distinctive visual system.

This is a client-focused redesign. The multiplayer protocol and authoritative game engine remain intact. The work will primarily change the client-side state model, rendering, interaction patterns, and visual assets.

## Goals

1. Replace gameplay-blocking modal flows with contextual, in-table interactions.
2. Make the exchange phase feel physical and readable: choose a target, choose a card from hand, animate the pass, allow undo, and confirm only after three cards are assigned.
3. Add a beginner mode (“Coach”) that explains the current task, highlights legal options, and gives concise rule/context guidance without taking control away from the player.
4. Upgrade the card presentation to a more illustrated, hand-crafted look while preserving strong readability.
5. Improve perceived liveliness of the table with clearer player state, visible side-hand stacks/fans, play/pass feedback, and smoother animations.
6. Keep the game responsive on phone, tablet, and desktop.

## Non-goals

1. No rule overhaul. Existing game rules and scoring remain the same except for bug fixes discovered during implementation.
2. No backend protocol changes unless a client need exposes an actual server contract bug.
3. No production asset pipeline or bundler migration in this pass.
4. No full interactive tutorial match. Beginner support is continuous coaching, not a scripted lesson.

## Constraints and existing context

- Current game phases already exist and are sufficient: `grand`, `exchange`, `play`, `round-end`, `match-end`.
- Current UI uses blocking modals for Grand Tichu, exchange, Mah Jong wish, Dragon recipient, round end, and match end.
- Rules helpers already expose `possibleSelections()` and combination classification, which makes a coach layer feasible without duplicating game rules.
- The app is currently a lightweight static frontend with ES modules and no build step.

## User experience design

### 1. Interaction model: “the table stays alive”

The table must remain visible and interactive during all gameplay decisions. Informational surfaces may appear as light overlays, drawers, or anchored panels, but they must not dim the whole screen or freeze the rest of the play area unless the game is in a non-interactive end state.

#### Gameplay decisions that move from modal to inline interaction

1. **Grand Tichu**
   - Shown as a compact decision ribbon above the player hand after the first 8 cards are dealt.
   - Two buttons: `Grand Tichu +200` and `Pass`.
   - Ribbon disappears once the local player decides.
   - Remote players’ decisions are shown in their seat badge/status.

2. **Exchange**
   - The center status area changes into an exchange controller.
   - Step-by-step prompt: “Pass a card to Mei”, then “Pass a card to Wei (partner)”, then “Pass a card to Lin”.
   - The active target seat pulses.
   - The player picks the card from their hand directly.
   - Chosen cards appear as small assigned chips/cards near each target seat.
   - Clicking an assigned card undoes that assignment and returns the card to hand.
   - Once all three targets have an assigned card, a `Confirm exchange` button becomes enabled.

3. **Mah Jong wish**
   - After a play containing Mah Jong is chosen, a compact anchored wish bar appears near the center with rank chips `2` through `A` plus `No wish`.
   - Selecting a rank completes the play submission.

4. **Dragon recipient**
   - If the local player wins a trick with Dragon and must choose an opponent, the eligible opponent seats glow and become clickable.
   - Helper copy explains that the trick is given away but the lead is retained.

5. **Round end / match end**
   - Displayed as an in-table summary card/panel, visually lighter than the current blocking modal.
   - Background table remains visible.
   - This can still be focus-trapping for accessibility, but visually it should feel like an in-world summary rather than a blackout modal.

#### Panels that remain as drawers or overlays

- Rules
- Log
- Online / multiplayer lobby

These are non-immediate actions and can remain secondary surfaces.

### 2. Beginner Coach

The game gains a user-facing setting `Coach`, enabled by default for fresh sessions and stored in local preferences.

#### Coach responsibilities

1. Explain the current task in one or two sentences.
2. Explain why an action is or is not legal based on real rule evaluation.
3. Highlight cards that participate in at least one legal move.
4. Describe the currently selected combination.
5. Offer an optional hint action that suggests a move but does not auto-play it.
6. Provide contextual mini-explanations for special cards and Tichu declarations.

#### Coach presentation

A compact coach panel appears above or near the player hand and contains:
- current prompt, e.g. “Mei played a pair of 7s. You need a higher pair, a bomb, or pass.”
- selected combo verdict, e.g. “Pair of queens — valid and beats the table.”
- optional hint count, e.g. “You have 3 legal options.”
- a `Hint` button
- a `Coach on/off` toggle

#### Coach content rules

- It must be concise and readable in one glance.
- It must never expose hidden information or strategy based on opponents’ hands.
- It may classify a move as “simple”, “safe”, or “aggressive” only using public state and the player’s own hand.
- It should prefer explanation over jargon.

#### Coach scenarios

1. **Lead with no previous play** — explain that any valid opening combo can be played.
2. **Respond to a previous play** — explain matching type and higher value requirement, plus bombs.
3. **Wish active** — if the player can fulfill it, explain that they must include the wished rank in a legal play.
4. **Exchange phase** — explain the relationship between opponents and partner, and what is being assigned right now.
5. **Special cards** — on hover/tap, show a short tooltip/flyout for Mah Jong, Dog, Phoenix, Dragon.
6. **Tichu / Grand Tichu** — explain stake and condition when the action is available.

### 3. Table liveliness

The table should feel more active even with the same underlying rules.

Improvements:
1. Show visible side-hand stacks/fans for left and right opponents instead of badges only.
2. Animate card plays from the acting seat toward the center.
3. Show a temporary `PASS` badge near a seat when a player passes.
4. Keep the last active play visually grouped and labeled.
5. Animate trick collection toward the capturing seat.
6. Strengthen current-player emphasis on badges and/or seat edge glow.
7. Improve hand layout so 14 cards fit small screens without clipping.

## Visual design

### Card art direction

The new deck should feel illustrated and thematic, not like a casino deck and not like copied official Tichu art.

#### Base style
- ink-and-wash / watercolor-inspired illustration language
- warm paper texture
- clear border and readable rank placement
- slightly ornamental but still game-usable

#### Suit themes
- **Jade** — green gemstone / bamboo / leaves
- **Swords** — blades / tassels / red accents
- **Pagodas** — architecture / layered roofs
- **Stars** — night sky / constellations / indigo

#### Special cards
Each special card gets unique illustration treatment while remaining readable at small size.

- **Mah Jong** — light traveler / first tile / wish motif
- **Dog** — stylized guardian dog / hound motif
- **Phoenix** — vivid bird with sweeping motion
- **Dragon** — long serpentine dragon, stronger premium treatment

#### Technical asset format
- Prefer SVG for lightweight crisp rendering.
- If some illustrations must start raster-first, export optimized PNG/WebP fallbacks at small size.
- The app must still work if assets are unavailable by falling back to text/symbol rendering during development.

### Table styling

- Preserve the current green felt + wooden rim foundation, but refine it.
- Add more nuanced seat state styling.
- Make the center area capable of supporting contextual controls without feeling crowded.
- Ensure mobile layouts preserve playability before decoration.

## Architecture and component changes

### Existing files likely to change

- `index.html`
- `styles.css`
- `src/ui.js`
- `src/game.js`
- `src/rules.js`
- tests under `tests/`

### New client-side structures

The current game state should gain UI-oriented state that is separate from core rules whenever possible.

#### UI state bucket
A dedicated UI state object should be introduced inside the client layer (or alongside the existing state wrapper) for ephemeral presentation state such as:
- coach enabled flag
- coach message / hint state
- exchange assignment state before confirmation
- currently active exchange target
- inline wish picker visibility
- dragon target selection mode
- transient seat feedback (`pass`, `received`, `tichu-called`)
- animation queue / active animation markers

This state should not be pushed into the authoritative game engine unless it represents a real game action.

### Suggested module split

To keep `ui.js` from growing into a monolith, split it into focused files:

- `src/ui.js` — app bootstrap and high-level render orchestration
- `src/ui-render.js` — seat, table, hand, coach, and summary rendering helpers
- `src/ui-overlays.js` — drawers/secondary surfaces (rules, log, multiplayer)
- `src/ui-interactions.js` — click/selection handlers for table interactions
- `src/coach.js` — derives coach prompts, legal highlights, and hint suggestions
- `src/card-art.js` — card metadata / asset resolution / fallback selection

If the repository is kept intentionally small, the split may be lighter, but at minimum the coach logic should not live inline among DOM event handlers.

### Game logic changes

The rules engine should remain the source of truth for legality, but a few additions are recommended:

1. Add helpers that expose legal-move metadata in a coach-friendly format.
2. Add a helper that returns which cards in hand belong to at least one legal move.
3. Add descriptive labels for plays (`pair of queens`, `straight to ten`, etc.) so UI and coach do not generate inconsistent naming.
4. Review edge cases around Mah Jong, Phoenix, and large-hand selection enumeration discovered during implementation.

### Exchange flow changes

Current exchange behavior accepts a final map after form-style selection. That engine contract can remain, but the client now stages the exchange locally until confirmation.

Flow:
1. enter exchange phase
2. initialize ordered local targets
3. user chooses one card per target
4. user may undo/reassign freely
5. on confirmation, send the same `map` payload as today

This preserves server compatibility while dramatically improving UX.

### Multiplayer compatibility

The redesign must work in both local and online play.

Requirements:
- No client-only shortcut may bypass current authoritative actions.
- Inline Grand, exchange, wish, and Dragon choice must ultimately call the same multiplayer actions currently used by the modal flow.
- Coach must operate on the current local state view only and must not rely on hidden multiplayer data.

## Accessibility

1. Preserve keyboard accessibility for selecting cards, choosing inline targets, and submitting actions.
2. Ensure status changes and coach updates are screen-reader friendly using existing status/toast/live regions where appropriate.
3. Maintain sufficient contrast for card faces, selected states, and legal highlights.
4. On mobile, avoid tiny tap targets for wish ranks and assigned exchange chips.

## Error handling

1. If a staged exchange becomes invalid (e.g. the player tries to assign the same card twice), the UI should prevent confirmation and explain the problem inline.
2. If a multiplayer action fails server validation, show a toast and keep the current inline control open if possible.
3. If illustrated assets fail to load, fall back to the current symbolic card rendering.
4. If coach derivation fails for a weird edge case, fail soft: disable the specific hint output but keep gameplay functional.

## Testing strategy

### Unit/regression tests

Add or expand tests for:
1. coach legal-option derivation from `possibleSelections()`
2. wished-rank obligation exposure
3. descriptive play labeling
4. exchange staging validation
5. any rule fixes introduced while supporting coach messaging

### Manual and browser testing

Test flows:
1. Grand Tichu local decision inline
2. exchange with assign / undo / confirm
3. Mah Jong play + wish selection
4. Dragon trick + recipient choice
5. normal trick response with coach enabled and disabled
6. local game with bots
7. online room flow with the same actions

### Responsive testing

Target views:
- phone portrait
- phone landscape
- 10-inch tablet portrait and landscape
- desktop at common widths

Important checks:
- full 14-card hand remains reachable and readable
- coach panel does not cover critical controls
- side seats do not overlap center controls
- drawers remain usable on small screens

## Delivery plan boundary

This spec covers design and architecture only. The following implementation work will be planned next:
1. create the detailed implementation plan
2. prepare Figma mockups for table/exchange/coach/card directions
3. create or source final card illustration assets/fallbacks
4. implement UI state and inline flows
5. implement coach derivation and visuals
6. run responsive and gameplay testing

## Open decisions already resolved

- Beginner support is a persistent coach, not a one-time scripted tutorial.
- Coach is enabled by default and user-toggleable.
- Rules/Log/Online remain secondary drawers.
- Exchange becomes staged inline selection from the hand.
- The visual direction favors illustrated thematic cards over typographic-only cards.
