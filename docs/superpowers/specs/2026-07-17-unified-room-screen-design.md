# Unified Room Screen (Lobby + Game merge) — Design

## Problem

The app currently has 8 screens stitched together by `RoomComponent`'s `@switch (gameStateService.currentView())`: `lobby-screen`, `role-reveal-screen`, `night-action-panel`, `day-discussion-screen`, `voting-screen`, `hunter-revenge-modal`, `game-over-screen`, each wrapped (for the in-game ones) in `game-shell` as of the LUNARIS pass. This reads as a sequence of different apps rather than one continuous room. The user wants exactly **2 screens total**: Home (create/join) and Room — where Room is a single persistent layout from the moment you join a lobby through game-over, with only its contents adapting to phase.

The user has also provided a static HTML mockup — `werewolf_game_interface (2).html` (repo root) — and wants the Room screen's visual design to match it closely: same 3-column layout, same Identity Grimoire flip-card, same player-grid card style, same phase banner, same chat panel styling. This supersedes the current `game-shell`'s simpler roster-list layout.

## Scope

**In scope:** Rebuilding `game-shell` (or its successor) as the single persistent Room layout covering lobby-through-game-over; a new Identity Grimoire card component matching the mockup exactly (built fresh, not reusing `role-card`/`animated-card`); a new player-grid component whose per-card action button is phase/role-driven; a phase banner component; a contextual header action button; retiring the old per-phase screen components' role as top-level routed views (their logic moves into the new sub-components).

**Out of scope:** Backend changes (none needed — this is a pure frontend recomposition of already-existing API calls). Sound/ambience (per earlier decision, omitted entirely — no Tone.js). Pixel-perfect Tailwind reproduction — the mockup is Tailwind + inline styles; this app uses plain BEM-ish SCSS per component (existing convention), so the mockup is a visual reference to match (colors, spacing, proportions, component shapes), not a literal class-for-class port.

## Architecture

`RoomComponent` keeps its two-state gate (`needsDisplayName` vs. the room), but the room side stops `@switch`-ing between whole screens. Instead it always renders one new component — call it `RoomShell` (replacing `game-shell` as the always-mounted container) — which internally reads `GameStateService.currentView()` (extended to include `'lobby'` and `'game-over'` as first-class states it already renders, not routes elsewhere) and swaps only the _inner_ pieces:

```
RoomShell
├── header: logo, Rules & Setup button, contextual action button
├── left column
│   ├── IdentityGrimoireCard (new) — lobby placeholder → role flip → (game-over: not needed, grid handles reveal)
│   └── SessionStatsCard (small, folded into RoomShell or its own component) — living/dead counts + objective line
├── middle column
│   ├── PhaseBanner (new) — icon/status/instruction, right-aligned slot for discussion countdown
│   └── PlayerGrid (new) — replaces the current roster list; each card's action button/content is phase-driven
└── right column
    └── existing chat sidebar (kept, relabeled Public Square / Private Grimoires)
```

`GameStateService.currentView()` already computes `'lobby' | 'role-reveal' | 'night' | 'day-discussion' | 'voting' | 'hunter-revenge' | 'game-over'` — no change needed there. What changes is that `RoomComponent`'s template stops mapping each of those to a different top-level component and instead always renders `<app-room-shell>`, which itself holds the phase-conditional logic that used to live spread across 7 separate components.

The existing per-phase components' _logic_ (not their standalone-screen role) is preserved by moving their computed signals/submit methods into the new sub-components:

- `lobby-screen`'s ready/kick/start-game/cancel logic → header contextual button + PlayerGrid's lobby-mode card actions.
- `role-reveal-screen`'s reveal-then-continue flow → IdentityGrimoireCard's flip interaction (tapping the card _is_ "continue"; no separate "Got it" button).
- `night-action-panel`'s five per-role visibility computeds and submit methods → PlayerGrid's night-mode card actions (a role-appropriate button appears only on the card of whichever player is a valid target, only for the player whose turn it is).
- `day-discussion-screen`'s countdown → PhaseBanner's countdown slot; its "advance to voting" action → header contextual button.
- `voting-screen`'s vote-casting/tally/close-voting → PlayerGrid's voting-mode card actions + header contextual button for "Close Voting Early".
- `hunter-revenge-modal`'s shoot/pass → PlayerGrid's hunter-revenge-mode card actions, scoped to the pending hunter only; everyone else sees a waiting state in the PhaseBanner. This stops being a `position: fixed` full-screen overlay — it's inline in the persistent layout, matching "no more separate screens."
- `game-over-screen`'s role-reveal grid + rematch → PlayerGrid's game-over-mode (revealed roles per card) + header contextual "Rematch in this room" button; "View Log" and "Leave Room" become secondary actions (e.g. small buttons near the header, not a whole separate screen).

The old component files (`lobby-screen`, `role-reveal-screen`, `night-action-panel`, `day-discussion-screen`, `voting-screen`, `hunter-revenge-modal`, `game-over-screen`) are deleted once their logic is absorbed — they stop being routed/switched anywhere. `RoomComponent`'s `@switch` block is deleted; it becomes a single `<app-room-shell>` behind the existing `needsDisplayName` gate.

## Visual design (matching the mockup)

New SCSS tokens/layout for `RoomShell`, replacing `game-shell.scss`'s current tokens, adapted from the mockup's `:root` custom properties:

- Day: `--accent: #f59e0b` (amber), gradient `#f59e0b → #ea580c`. Night: `--accent: #c084fc` (purple), gradient `#8b5cf6 → #6366f1`. Surface `#0f1115`/`#1a1d24`/`#242932`, border `#2d323f`, text `#f1f3f4`/`#9aa0a6` — same values already partially present in the current `game-shell.scss`, just extended with the gradient pair and consistent naming.
- **IdentityGrimoireCard**: rebuilt to match the mockup's `card-container`/`card-inner`/`card-front`/`card-back` 3D flip (170×240px card, front shows a mystery "✨" glyph + "TAP CARD TO INSPECT", back shows role emoji/name/description) — a new component, independent of the existing `role-card`.
- **PlayerGrid**: 2-column card grid (mockup's `sm:grid-cols-2`), each card = avatar (using the existing `Avatar` component's seeded-generation, not external photo URLs — no reason to add an image dependency) + name + alive/dead status dot + vote-count badge when relevant + the phase-appropriate action button on the right, styled per the mockup's rounded-2xl bordered card with the `suspicious-pulse` glow treatment for a card the viewer has voted for.
- **PhaseBanner**: icon chip + status label + instruction text, matching the mockup's warm/cool banner; countdown clock styled like the mockup's monospace "Sunset in 01:45" chip, wired to the real `discussionDeadlineUtc` (already built in the existing day-discussion countdown logic — ported here, not rebuilt).
- **Chat panel**: kept structurally as-is (already close to the mockup already), tabs relabeled "Public Square" / "Private Grimoires" to match mockup copy.
- Header gets the mockup's sticky/blurred style and the LUNARIS logo mark.

## Risks / open questions resolved during brainstorming

- Sound/ambience: omitted (matches prior LUNARIS constraint).
- Identity/role-reveal component: rebuilt fresh rather than reusing `role-card`/`animated-card` (explicit user choice — accepts some duplication with any other place `role-card` is still used, if any remain after this change; a follow-up cleanup pass could later fold `role-card` usages into the new component if it turns out nothing else needs the old one).
- Header's fake "Switch to Night/Day" toggle in the mockup has no real backend equivalent (phases are server-driven) — replaced with the contextual host-action button described above.
