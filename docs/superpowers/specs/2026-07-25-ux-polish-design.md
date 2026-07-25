# UX bug fixes + visual polish pass — design

## Context

A live playthrough of the app (6 simulated players, full lobby → night → day → voting → game
over, both locales, desktop + mobile viewport) surfaced a handful of real friction points, and the
user asked for a follow-up pass to make the app feel more impressive, focused on visual polish and
atmosphere. This spec covers both: fix what's broken first, then build the polish on a clean base.

The app already has a solid design-token foundation (`src/styles/abstracts/_design-tokens.scss`):
per-faction accent colors, three purpose-built font families (`--font-title` gothic display,
`--font-ui` calligraphic, `--font-body` Inter for i18n-safe body copy), and even an alternate
"bloody" theme toggle. This pass builds on those tokens rather than introducing a new palette or
font stack.

## Scope

### 1. Bug fixes (land first — everything else builds on a clean base)

- **Toast queue** (`src/app/shared/components/toast-list/`, `ToastService`): cap visible toasts to
  one at a time, queuing the rest; fix whatever is preventing reliable auto-dismiss. Root cause:
  observed a "Role distribution updated." toast (fired in the lobby) still on screen well into
  Night 1, overlapping the Identity Grimoire card's header text.
- **Mobile grid order** (`room-shell.scss`, the `≤900px` breakpoint at line ~210): reorder via CSS
  `order` on the three grid columns so phase banner → action panel → player grid renders first,
  Identity Grimoire/Coven stats second, chat third. No markup changes — grid items, not DOM order.
- **Start Game disabled-state contrast** (`room-action-panel`): the `[disabled]` state currently
  reads as nearly the same gold as enabled. Give it a distinctly muted (desaturated + lower
  opacity) treatment.
- **Settings modal role-count validation** (`settings-modal.ts`/`.html`): add a live "N / M
  assigned" counter bound to the room's current player count, and disable "Apply Role
  Distribution" when the sum doesn't match, instead of letting it round-trip to a silent 400.
- **VI i18n fixes**: the Game Over banner interpolates the raw faction enum name untranslated and
  with mangled diacritics (observed: "Villagers thả́ng!" instead of the correctly-translated,
  correctly-accented string). Fix the translation key/interpolation. Also clear the stale
  "Tallying the votes…" status line once the game reaches `GameOver` — it's leftover transitional
  copy that no longer matches the screen.

### 2. Atmosphere & backdrop

- Extend the existing `room-backdrop` component (haunted-house silhouette, howling-wolf silhouette
  that fades in at night) with a subtle parallax drift and a slow ambient particle layer — drifting
  fog wisps at night, faint floating motes by day. CSS-only (transform/opacity keyframes), no new
  JS animation loop. Respects `prefers-reduced-motion` via the same pattern already used for the
  dying/phase-transition/iris-wipe animations.
- Give the phase-transition moon disc (`phase-transition` component) a soft pulsing glow keyed to
  the current phase's accent (`--color-moonlight` at night, a warmer tone by day) instead of a
  static glow.

### 3. Micro-interactions & juice

- Press/hover states for primary action buttons (Attack/Vote/Start Game/Ready Up): subtle
  scale + glow on `:hover`/`:active`.
- Player-card target-selection feedback: a brief ripple/pulse on the chosen target's existing
  role-accent ring when Attack/Vote is pressed, reusing the accent-glow pattern already used for
  night-action targeting.
- Toast entrance/exit slide+fade, paired with the queue fix in §1.
- Living/Fallen stat tiles (`Coven Live Overview`) animate the count up/down on change instead of
  snapping instantly.

### 4. Typography & layout rhythm

- Audit phase-banner and headers for consistent `--font-title` usage (some header contexts fall
  back to body font where the title font would read better).
- Tighten spacing rhythm (a consistent gap/padding scale) across lobby cards and the room-shell's
  three columns. A refinement pass, not a redesign — no new components, no layout restructuring
  beyond the mobile `order` fix in §1.

### 5. Cinematic beats

- **Role reveal** (first Identity Grimoire card flip): add a brief anticipation beat — a shimmer
  sweep across the card face — before the flip, instead of an instant flip.
- **Night-kill / lynch reveal**: sequence the existing "dying" animation with a short delay before
  the phase-banner status text updates, so the reveal reads as a beat (animation, then
  confirmation) rather than both landing simultaneously.
- **Game Over**: stagger the final role-card reveals — each surviving/fallen player's card flips in
  sequence with a short per-card delay — building up to the faction-win banner, instead of every
  card appearing flipped at once.

## Out of scope

- No new color palette or font stack — reuse existing tokens throughout.
- No changes to game rules, backend contracts, or SignalR/HTTP shapes (this is a pure frontend
  visual/UX pass; no doc-sync updates needed per `CLAUDE.md`'s API-docs rule).
- No sound/audio (visual-only per the user's stated direction).
- No changes to the "bloody" alternate theme beyond whatever automatically inherits from token
  changes.

## Testing

- Existing Playwright e2e suite (`npm run e2e`) must continue to pass unmodified — it exercises
  the exact flows this pass touches (lobby, role distribution, ready-up, night actions, voting,
  chat, game over).
- Manually re-verify the toast-stacking, mobile-ordering, and VI-i18n fixes via a live playthrough
  (the same method used to find them), since none of the three has automated coverage today.
