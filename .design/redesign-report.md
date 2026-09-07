# Tichu redesign audit

Mode: redesign / implementation guidance
Scope: current `feature/ux-coach-illustrated-cards` branch

## Product read

Tichu is a tactical partnership card game. The first useful viewport must answer four questions immediately: whose turn is it, what was played, what can I play, and how many cards remain at each seat.

The strongest existing identity is the physical table direction: dark green felt, wood/lacquer frame, brass accents, ivory cards, and Chinese-inspired suit/special-card vocabulary. This should be refined instead of replaced by a generic app shell.

## Confirmed strengths

- The table remains the primary composition rather than a dashboard of panels.
- Card overlap is already used, which fits the physical-game metaphor and is the correct response to 14-card hands.
- The current palette is restrained and substantially closer to a premium tabletop product than to a SaaS UI.
- Special-card handling, Coach logic, and inline decision work provide a strong foundation for teaching without forcing a separate tutorial flow.

## High-impact findings

### P0 — mobile command access must not disappear

The earlier responsive CSS hid `.top-actions .ghost` below 900 px. Log, Rules, and Online therefore became inaccessible rather than recomposed. Mobile needs a compact overflow/menu or persistent small controls.

### P0 — portrait hand geometry must be adaptive

A fixed card width + fixed negative margin can exceed common 360 px portrait widths with a 14-card hand. Player-hand spacing should be computed or controlled through CSS variables based on card count and available width. Overlap is preferable to horizontal page scrolling.

### P1 — left/right seats need physical hands

Badges without card backs make the table visually top/bottom-heavy and weaken the four-player mental model. Render narrow vertical or rotated/fanned stacks for seats 1 and 3.

### P1 — central trick needs history and physical placement

Showing only the latest play loses spatial understanding. Keep the current trick's contributions visible long enough to understand turn order, then animate capture toward the trick winner.

### P1 — special-card art needs stronger differentiation

Text + one Chinese glyph reads like a placeholder. Keep corner readability but give Mah Jong, Dog, Phoenix, and Dragon distinct central illustrations with a shared material language.

### P1 — team labels must derive from seating

Team A is seats 0+2 and Team B seats 1+3. Names should be generated from the current local/online seat mapping instead of hard-coded labels.

### P2 — score and app chrome should recede

The game title, score, and utility actions should frame the table without competing with the current trick. Keep them compact and materially consistent with the table frame.

### P2 — Coach should feel attached to the decision

Coach should sit close to the player's hand/action rail, use one short explanation, and highlight legal local cards. Avoid a detached large panel that competes with the table.

## Visual direction

Use the project-root `DESIGN.md` as the canonical source. The recommended signature is a **modern lacquered travel game set** with bespoke illustrated cards. Spend the visual boldness on the card faces and trick motion; keep app chrome disciplined.

## Motion contract

- selection: controlled lift;
- play/pass: short directional card travel;
- exchange: face-down travel toward the destination seat;
- capture: current trick converges toward the winner;
- active player: stable brass perimeter emphasis;
- no continuous glow loops;
- full reduced-motion fallback.

## Verification targets

Before merge, verify at minimum:

- desktop 1440×900,
- tablet landscape around 1024×768,
- phone portrait 360×800,
- phone landscape around 800×360,
- keyboard focus through hand/actions/utility controls,
- reduced-motion mode,
- 14-card player hand,
- active wish,
- exchange state,
- Dragon recipient state,
- online room state.

Runtime/browser verification remains required; this report is based on repository evidence, not a browser screenshot of the latest branch.
