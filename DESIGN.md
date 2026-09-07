# Tichu visual design system

## Product identity

Tichu is a tactile four-player partnership card game. The interface should feel like a premium physical table translated to the browser: calm enough for long sessions, distinctive enough to be recognisable instantly, and readable on desktop, tablet, and phone.

The product is not a casino dashboard, cyberpunk HUD, generic glassmorphism app, or faux-antique parchment game. The visual world should borrow from lacquered Chinese game boxes, woven table cloth, brass hardware, hand-inked card art, and restrained contemporary typography.

## Audience and primary job

The player should be able to understand the current trick, whose turn it is, what can be played, and what a special card does without opening a separate rules screen. Experienced players should be able to ignore the Beginner Coach and play quickly.

## Visual thesis

**A modern lacquered travel game set.**

The table is the hero. UI chrome should recede into the perimeter while cards and current trick remain the visual focus. The one signature flourish is the illustrated card system: each suit has its own line-art language and the four special cards receive full bespoke motifs.

## Palette

Runtime tokens should derive from these semantic roles rather than copying values ad hoc.

- `lacquer-950` — `#07110E` — app background / deepest frame
- `tea-felt-800` — `#173D2D` — primary table felt
- `tea-felt-700` — `#20503B` — felt highlight / active surface
- `aged-brass-500` — `#C9A45F` — frame details, focus, restrained emphasis
- `bone-100` — `#F3EEDF` — normal card face
- `ink-900` — `#18211D` — card text and line art
- `cinnabar-500` — `#C85A4A` — danger / Swords / Dragon accent
- `jade-500` — `#2C9B78` — positive / Jade accent
- `lapis-500` — `#4D70A8` — Pagodas accent
- `mulberry-500` — `#7C5890` — Stars / Phoenix secondary accent

Use brass sparingly. It is a material cue, not a universal highlight color.

## Typography

Keep typography quiet around the cards.

- Display / round results / game title: a restrained high-contrast serif with East-Asian editorial character where available; fallback `Georgia, 'Times New Roman', serif`.
- UI controls / player labels / Coach: `Inter, ui-sans-serif, system-ui, sans-serif`.
- Data / tiny card annotations: same UI family in tabular-numeric mode where supported.

Avoid all-caps for sentences. Uppercase is reserved for compact physical-object labels such as `TICHU`, `DRAGON`, or team micro-labels.

## Table composition

Desktop should read as a real four-seat table:

- partner hand centred at the top,
- opponent hands visible as narrow vertical/fanned card backs on left and right,
- player hand anchored to bottom and allowed to overlap strongly,
- current trick kept in a clear central stage,
- score compact and peripheral,
- Coach docked near the player's decision area rather than floating as a large modal.

Gameplay decisions such as Grand Tichu, exchange, Mah Jong wish, and Dragon recipient should happen in context on the table. Full-screen modal blackout is reserved for out-of-game surfaces such as Rules and Online lobby.

## Card system

### Normal suits

All 52 normal cards share the same geometry and hierarchy. The rank must remain immediately readable even when cards overlap.

- **Jade**: leaf / carved-jade / geometric knot language.
- **Swords**: crossed blade / red lacquer line work.
- **Pagodas**: roofline / gate / architectural line work.
- **Stars**: celestial compass / constellation line work.

Rank and suit identity occupy the corner. The centre may contain an illustrated motif, but never at the cost of scanability in a 14-card hand.

### Special cards

The special cards are deliberately more illustrative, with a larger visual field and a restrained title.

- **Mah Jong**: moon gate / river stone / dawn motif. Calm, pale jade and brass.
- **Dog**: guardian hound running toward the opposite seat. Warm black, ivory, and brass.
- **Phoenix**: rising firebird built from cinnabar and mulberry feather shapes. Energetic but not neon.
- **Dragon**: coiled dragon rendered as carved lacquer/jade line art. Highest visual weight of the four.

Special art must stay inside a safe central field so card corners, selection rings, and overlap never cover important anatomy.

## Motion

Use motion to sell physicality, not spectacle.

- Deal/pass/play: short ease-out translation with slight rotation.
- Selection: 8–16 px lift, no bounce loop.
- Trick capture: cards converge toward the winner before disappearing.
- Active seat: subtle perimeter glow or brass ring, no pulsing neon.
- Coach hint: one short highlight pass, not continuous flashing.

Respect `prefers-reduced-motion` and provide a stable no-motion state.

## Beginner Coach

Coach is a teaching layer, not a second game UI.

- Enabled by default for a new local player.
- May highlight only cards in the local player's hand and only from legal move analysis.
- Must never infer or display hidden opponent information.
- Explains the current requirement in one or two short sentences.
- Uses a single compact dock/panel with a clear off toggle.
- A valid selected combination should be named explicitly (`Higher pair`, `Straight`, `Bomb`, etc.).

## Responsive contract

### Desktop

Show all four physical hands and preserve generous centre-table space.

### Tablet

Reduce card dimensions and chrome before reducing legibility. Side hands may become tighter vertical stacks.

### Portrait phone

Recompose rather than shrink desktop:

- player hand must fit the viewport with dynamic overlap,
- side hands become narrow edge stacks,
- score becomes a compact top rail,
- Rules / Online / Log remain accessible through a compact menu rather than disappearing,
- Coach becomes a bottom-adjacent compact strip or expandable sheet,
- primary action controls stay reachable above browser safe areas.

No horizontal page overflow at 200% zoom for non-game chrome. During actual card play, overlap is preferred to scrolling the hand horizontally.

## Accessibility

- WCAG 2.2 AA target for UI text and controls.
- Visible keyboard focus uses brass + high-contrast outline, not color alone.
- Selected cards require elevation plus outline/shape change.
- Active player state requires more than color.
- Buttons retain stable geometry in busy/disabled states.
- Special card meaning is always available as text, not illustration alone.

## Asset policy

1. Central illustration assets may be produced with Image Gen or Blender renders, then reduced into implementation-friendly transparent assets/textures where appropriate.
2. Card rank/suit labels and game controls remain code-native.
3. Do not use stock imagery, generic fantasy trading-card art, or random AI characters.
4. Asset lighting and material language must match the lacquer / felt / brass system.
5. If Blender is used, prefer a small reusable material library (lacquer, brass, ivory card stock, felt) and render orthographic or near-orthographic assets. Do not introduce realtime 3D to the browser solely for decoration.

## Durable component families

- `GameTable`
- `Seat / PlayerBadge`
- `OpponentHand`
- `PlayerHand`
- `CardFace / CardBack / SpecialCardFace`
- `TrickStage`
- `ScoreRail`
- `ActionRail`
- `CoachDock`
- `InlineDecision`
- `Toast`
- `Drawer`
- `Modal` (Rules / Online only)

Visual differences should become named variants of these families instead of screen-local one-off CSS.

## Things to avoid

- neon cyberpunk glow,
- purple-blue SaaS gradients,
- glass panels everywhere,
- giant rounded cards around every piece of information,
- faux-Chinese decorative glyph spam,
- unreadable ornamental fonts,
- generic fantasy-card illustration,
- tiny portrait-mobile cards that require guessing ranks,
- gameplay decisions hidden behind modal blackouts,
- hiding Log / Rules / Online on mobile without an alternative path.
