# Tichu table hierarchy, movable Coach, and motion design

## Purpose

The desktop table should read as a four-player card game at a glance. Cards, player identity, and the current trick must carry more visual weight than menus or decorative copy. Every play should visibly travel from its player to the table, and every completed trick should visibly travel to its recipient.

This iteration keeps the existing lacquer, felt, illustrated cards, rules, Coach content, and multiplayer action contracts.

## Desktop layout

### Card scale

Desktop uses one table-card size for opponent hands and played cards, initially `96 × 142 px`. The local player's cards use a slightly larger `104 × 154 px` size. Card aspect ratio is shared and all sizes are represented by CSS custom properties.

Opponent hands differ through orientation and overlap only:

- the partner's hand is a horizontal fan centered on the top seat;
- the left and right hands are vertical fans centered on their seats and rotated toward the table;
- each fan computes its step from its available span and card count;
- badges and hands share the same seat axis, so a hand cannot appear offset from its owner.

Mobile retains separate compact tokens. Desktop tuning values do not change phone layouts.

### Player badges

Desktop badges use a 48 px avatar, 13 px player name, and 9 px status line. Left and right badges use symmetrical anchors. The active-player treatment remains visible without changing badge geometry.

### Current trick

Played cards use the shared table-card size rather than the existing `card-small` size. A combination overlaps only as much as needed to remain inside the central stage. The play description occupies a dedicated row below the cards, with enough reserved height that it cannot cover card art or another play label.

Older plays remain visually quieter, while the latest play stays fully opaque. The trick stage grows as needed for large combinations and remains clear of the main action buttons.

## HUD and navigation

### Game menu

The permanent left menu is removed. A menu button in the top bar opens a themed anchored popover containing:

- New game
- Rules
- Beginner Coach toggle
- Online
- History
- Dev UI

The popover closes on Escape, outside click, or after an immediate action. All entries remain keyboard accessible. The same disclosure pattern is used on desktop and mobile, with mobile sizing adjusted for touch.

The quote displayed over the table is removed from the gameplay screen.

### Movable Coach

On desktop and tablet, Coach becomes a floating window with a visible drag handle in its header. Pointer dragging works with mouse, pen, and touch. Movement is clamped to the visible table area with a safe margin above the local hand and status bar. Its position is stored in local preferences and restored after reload, then clamped again for the current viewport.

Coach content continues to update without rebuilding or losing the window position. The existing enable/disable control remains. On phone layouts Coach stays docked above the local hand because free dragging would compete with card gestures and limited screen space.

## Desktop Dev UI

The top-bar menu exposes a `Dev UI` drawer for live desktop tuning. It controls CSS custom properties rather than game state.

Initial controls:

- local card width;
- opponent and table card width;
- local hand overlap step;
- opponent fan overlap step;
- player badge scale;
- played-card overlap;
- Coach text scale.

Each control shows its numeric value and unit. Changes apply immediately and persist in a versioned local-storage record. `Reset defaults` restores the checked-in design values. `Copy settings` writes a compact JSON object to the clipboard and also shows it in a selectable text field if clipboard access is unavailable. This gives the user an exact configuration to send back for final tuning.

Below the desktop breakpoint the drawer remains viewable but tuning controls are disabled with a short explanation that mobile has independent values.

Invalid, missing, or out-of-range stored values fall back to defaults. Every slider has a conservative range that preserves usable geometry.

## Motion system

### Transition derivation

Motion remains a presentation concern. A UI transition controller stores an immutable projection of the previous rendered state:

- card IDs per hand;
- table entries with seat and card IDs;
- captured card IDs per seat;
- phase and Dragon-recipient state.

When the game emits a changed state, the controller compares the projections while the previous DOM is still present. It records source rectangles before `renderAll()` and target rectangles after rendering.

This supports local play, bots, and multiplayer snapshots without adding animation events to the rules engine or network protocol.

### Play animation

When cards disappear from a hand and appear in a new table entry:

- local cards animate from their exact selected-card rectangles;
- opponent cards animate from the exposed edge of the correct hidden hand;
- every card in a combination gets a clone and a short stagger;
- the new table group fades into its final position as the clones arrive.

The existing manual local-only animation is removed so one transition path handles every player.

### Trick collection

When table card IDs disappear and appear in a captured pile, visible trick cards animate toward the recipient's badge. Captured-card ID differences determine the recipient, which correctly handles Dragon tricks where the winner gives the trick to an opponent.

Clearing the table after Dog does not animate as a captured trick because no captured pile gains those cards. Round-end redistribution does not replace the actual last-trick recipient used for motion.

### Motion constraints

Animation clones carry stable `data-motion-kind`, `data-motion-seat`, and destination metadata for testing. They never receive pointer events. The controller skips motion when the game animation setting is off or `prefers-reduced-motion: reduce` is active. Clones remove themselves on finish and cancellation.

## State and module boundaries

- `src/ui-state.js` owns menu disclosure, Coach position, and validated Dev UI preferences.
- `src/ui-render.js` renders seat anchors, menu/Dev UI surfaces, Coach handle, and stable motion targets.
- `src/ui-interactions.js` owns dragging, geometry capture, state-transition derivation, and Web Animations API clones.
- `src/ui.js` coordinates previous-state snapshots, rendering, and action handlers.
- `src/game.js` and `src/rules.js` remain unchanged unless testing exposes a genuine game-state defect.
- `styles.css` defines desktop tokens and the responsive geometry. `concept-polish.css` must not override the new component tokens with duplicate hard-coded sizes.

## Accessibility and error handling

- The menu button exposes expanded state and associates itself with the popover.
- Coach dragging is additive; its content and controls remain keyboard accessible. A reset-position action is available in the Coach header.
- Dev UI controls use labels, keyboard-operable range inputs, numeric output, and a selectable fallback for copied settings.
- Restored Coach and Dev UI values are validated and clamped before use.
- Motion is decorative and never delays or gates a game action.

## Verification

Unit tests cover preference validation, defaults, reset behavior, transition derivation, normal trick recipients, Dragon recipients, and Dog clearing.

Playwright covers:

1. equal desktop card dimensions for the three opponent hands and the current trick;
2. the larger local-card dimension and a fully visible 14-card hand;
3. centered top/bottom seats and symmetric side-seat anchors;
4. readable trick layouts containing 1, 2, 5, and 8 cards with labels outside card bounds;
5. collapsed menu disclosure, all actions, Escape, outside click, and keyboard access;
6. Coach dragging, table-bound clamping, persisted restoration, and position reset;
7. Dev UI live changes, persisted reload, copied JSON, reset, and mobile isolation;
8. play motion from local, left, top, and right hands;
9. multi-card stagger, normal trick collection, Dragon recipient, Dog clearing, disabled animation, and reduced motion;
10. screenshot review at 2542 × 1283, 1440 × 900, 360 × 800, and 800 × 360.

All existing unit and browser tests remain green. Screenshot review is required because DOM geometry alone cannot establish visual hierarchy or motion readability.
