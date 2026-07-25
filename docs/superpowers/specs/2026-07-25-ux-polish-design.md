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

Two items from the initial playthrough turned out not to be bugs on closer reading of the code,
and are dropped from scope: the Start Game disabled state already gets `opacity: 0.5` (a standard,
adequate treatment), and the "Tallying the votes…" text that appeared to linger on the Game Over
screen is a deliberate 3s suspense delay (`VOTE_RESULT_REVEAL_DELAY_MS` in `room-shell.ts`) before
the lynch reveal — the screenshot just caught it mid-delay.

- **Toast position overlaps the Identity Grimoire card** (`toast-list.scss`): `ToastService`
  already auto-dismisses (4.5s) and caps visible toasts at 3 — those aren't broken. The actual bug
  is pure positioning: `.toast-list` is pinned `left: 0.75rem`, which is exactly where
  `.room-shell__left` (the Identity Grimoire card) renders, so any toast visually sits on top of
  it. Fix: center the toast list over the main content column instead of anchoring it to the left
  edge.
- **Mobile grid order** (`room-shell.scss`, the `.room-shell__viewport` `≤900px` breakpoint at
  line ~210): reorder via CSS `order` on `.room-shell__left` / `.room-shell__center` /
  `.room-shell__chat` so phase banner → action panel → player grid (`__center`) renders first,
  Identity Grimoire/Coven stats (`__left`) second, chat (`__chat`) third. No markup changes — grid
  items, not DOM order.
- **Settings modal role-count validation** (`settings-modal.ts`/`.html`): add a live "N / M
  assigned" counter bound to the room's current player count (`lobby.players.length`), and disable
  "Apply Role Distribution" when the sum doesn't match, instead of letting it round-trip to a
  silent 400.
- **VI i18n fix**: `roomShell.banner.gameOverStatus` (`"{{faction}} thắng!"` /
  `"{{faction}} win!"`) interpolates the raw backend enum value (`Villagers`, `Werewolves`,
  `Lovers`, `Tanner` — see `game.model.ts`'s `winningFaction` type) straight into the string, so it
  renders untranslated even in the Vietnamese UI (e.g. "Villagers thắng!"). Add a `factions.*`
  translation key per value in both locale files and look the value up through it instead of
  interpolating it raw.

### 2. Atmosphere & backdrop

**Correction from the initial review, found while reading the code for this plan:** a prior pass
(`docs/superpowers/specs/2026-07-19-game-feel-polish-design.md`) already wired up almost everything
this section originally proposed — `room-backdrop` already has a flickering haunted-house glow, a
night-only howling-wolf fade-in, two independently-drifting fog bands, and eight looping dust
motes, all `prefers-reduced-motion`-aware. Re-adding a "particle layer" or fog would duplicate live
code. The one genuinely open item:

- Give the phase-transition moon disc (`phase-transition.scss:19`, currently a static
  `box-shadow`) a soft pulsing glow keyed to the current phase's accent, instead of a fixed-size
  shadow.

### 3. Micro-interactions & juice

**Also already done** by the same prior pass: button hover/press states (`room-action-panel.scss`
already has `:hover:not(:disabled)`/`:active:not(:disabled)` transform+shadow treatments) and
target-selection accent feedback (the `--action-accent` role-color system + `cardGlowPulse`
keyframe). What's left:

- Toast entrance/exit slide+fade — entrance (`toastSlideIn`) already exists; add a matching exit
  animation so a dismissed/auto-expired toast fades out instead of disappearing instantly.
- Living/Fallen stat tiles (`Coven Live Overview`, `room-shell.html` ~line 95) animate the count up
  or down when it changes instead of snapping straight to the new number.

### 4. Typography & layout rhythm

`room-shell.scss` deliberately opts its own headings/buttons back into Inter (see its comment at
the top of the file: the gothic `--font-title`/`--font-ui` pairing "clashes with the LUNARIS
mockup's clean sans-serif look") — that's an intentional decision scoped to `.room-shell`'s own
template, not an oversight, and this pass does not touch it. `--font-title` stays exactly where
it's already used today (phase-transition overlay, identity grimoire card, home page).

- Tighten spacing rhythm (a consistent gap/padding scale) across lobby cards and the room-shell's
  three columns. A refinement pass, not a redesign — no new components, no layout restructuring
  beyond the mobile `order` fix in §1.

### 5. Cinematic beats

**Also already done:** the night-kill/lynch reveal already sequences — a death shows a ~900ms
"dying" animation on the player card, and a lynch specifically holds a "Tallying the votes…"
message for 3s (`VOTE_RESULT_REVEAL_DELAY_MS`) before the final text lands. No changes needed
there. Two beats remain genuinely unbuilt:

- **Role reveal** (first Identity Grimoire card flip): add a brief anticipation beat — a shimmer
  sweep across the card face — before the flip, instead of an instant flip.
- **Game Over**: stagger the final role-card reveals — each surviving/fallen player's card flips in
  sequence with a short per-card delay — building up to the faction-win banner, instead of every
  card appearing flipped at once (confirmed: no such sequencing exists today).

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
- Manually re-verify the toast-positioning, mobile-ordering, and VI-i18n fixes via a live
  playthrough (the same method used to find them), since none of the three has automated coverage
  today.
