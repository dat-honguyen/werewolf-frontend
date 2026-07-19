# Game-feel polish pass — design

## Context

A visual review of the live app (screenshots + running instance) found the LUNARIS room UI
(`room-shell` + `player-grid` + `room-action-panel` + `identity-grimoire-card`) solid but flat:
every night role renders through the same generic grid-of-circles, deaths cut instantly to a
static "dead" style with no beat, phase changes are a text swap with no transition, and the
background is a single flat radial gradient.

**Correction from the initial review:** the codebase already contains a nicer animation set
(`player-card` component, `_animations.scss` keyframes: `cardDeath`, `cardGlowPulse`,
`cardFlip`, `readyPop`; the `phase-transition` component with an iris-wipe) — but none of it is
wired up. `player-card` is imported nowhere. `phase-transition` is imported nowhere. The room
that actually renders (`RoomShell` → `PlayerGrid`) is a separate, later implementation using its
own local CSS custom properties (`--primary`, `--danger`, `--accent-day`/`--accent-night`,
scoped inside `.room-shell`), not the global `_design-tokens.scss` palette. This design targets
the _live_ component tree, not the dead one.

**Hidden-information constraint:** other players' roles are secret by design — the avatar
sigil/color on `player-grid` cards is a deterministic hash of _display name_, not role, and must
stay that way. Nothing in this pass may add a visual tell for another player's role on the grid.
Role-based color only ever applies to **your own** `identity-grimoire-card`, and to **your own
local selection UI** during your own night turn (e.g., your screen tinting red while you, the
werewolf, pick a victim) — never to how another player's card renders on anyone's screen.

## Scope (6 items, all CSS/TS in existing components, no new image assets)

1. **Per-role action accent.** During a night sub-phase, the acting player's own selectable/
   selected grid cards use a role-flavored accent color instead of the generic day/night
   `--primary`: werewolf → blood red, doctor → green (shield), seer → teal, cupid → pink, witch's
   poison-target selection → purple. Implemented as a `--action-accent` CSS var, set by `RoomShell`
   from a small `Role → color` map (new `role-accent.util.ts`, reusing the color values already
   sitting unused in `_design-tokens.scss`'s faction palette) and consumed by `player-grid.scss`
   with `var(--action-accent, var(--primary))` — so voting/hunter/lobby views are untouched.

2. **Moon-phase night/day transition.** Wire `phase-transition` (currently dead) into `RoomShell`:
   fire a brief full-screen overlay when the night/day _family_ changes (lobby→role-reveal,
   night↔day-discussion, →game-over), reusing the existing `phaseIris` clip-path wipe but ported
   to the live token set. A large moon/sun disc (CSS-drawn, no image asset) sits behind the wipe;
   the moon's phase (crescent → full → gibbous) advances with `nightNumber`, so it doubles as a
   subtle "which night are we on" cue rather than being pure decoration.

3. **Ambient background texture.** A very low-opacity (≈6%) static SVG line-art layer (faint
   circular ritual-mark, radiating from behind the player grid) added to `.room-shell`'s existing
   `background-image` stack. Static, not animated — the one big motion beat stays the phase
   transition.

4. **Sequenced death reveal.** Track newly-dead player IDs in `RoomShell` (diff `state().players`
   alive-flags across updates, same pattern already used for lobby join/leave diffing in
   `GameStateService.announceLobbyChanges`), expose a transient `dying` flag per grid entry for
   ~900ms before it settles into the static `--dead` style. Port the `cardDeath`-style
   grayscale+rotate keyframe (already written, just unused) onto `player-grid__card--dying`.

5. **Own-role card accent.** `identity-grimoire-card` gets a `--role-accent` var (same map as #1)
   applied only to its own border/glyph glow — day/night `--primary` still governs everything
   else in the shell. Purely self-facing, no information leak.

6. **Button color semantics fix.** `room-action-panel__button--primary` currently gradients into
   `var(--danger)` (`linear-gradient(135deg, accent-day, danger)`), which is why Ready Up/Submit
   Vote already read faintly red — diluting red as a "destructive" signal. Change that gradient's
   second stop to a gold tone instead of danger-red; leave `--danger` exclusively on Quit/Cancel
   Lobby/Leave Lobby/Kick, which are already correctly classed.

## Out of scope

- The dead `player-card`/`animated-card` components: left alone (not deleted, not resurrected)
  since removing them is an unrelated cleanup and no code path exercises them either way.
- Sound/audio.
- Illustrated role art — the existing abstract-glyph avatar system is a deliberate, working
  choice and not part of this pass.

## Testing

Existing Playwright e2e specs (`in-game-layout.spec.ts`, `full-game-happy-path.spec.ts`, etc.)
already screenshot every phase this touches; re-running them after the change is the primary
verification, plus a manual pass through a live game (backend + `ng serve`, both already running
locally) watching a werewolf kill, a doctor protect, a witch poison, and a lynch death.
