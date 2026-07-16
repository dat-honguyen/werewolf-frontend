# LUNARIS redesign + chat/timer/rematch — Design

Date: 2026-07-16
Repos: `werewolf-frontend` (Angular) and `werewolf` (.NET/Marten/Wolverine + SignalR), sibling directories.

## Goal

Restyle the live game view to match the provided mockup (`werewolf_game_interface (2).html`,
"LUNARIS") on both desktop and mobile, and close three real functionality gaps the mockup implies:
Town Square chat, a discussion-phase countdown, and the ability to play another round in the same
room after a game ends. Sound (Tone.js ambience) is explicitly out of scope.

This spans two repositories and four largely independent pieces of work:

- **A. Visual redesign** (frontend only)
- **B. Town chat wiring** (frontend + zero/near-zero backend, it's already built)
- **C. Discussion timer** (backend + frontend, both currently missing)
- **D. Rematch in the same room** (backend + frontend, both currently missing — the current
  backend cannot start a second game in a room at all)

Each is independently shippable; D is the largest and riskiest.

## A. Visual redesign

**Scope**: `game-shell` (shared chrome wrapping every live-game phase: header, roster, chat
sidebar, identity strip), the phase screens it wraps (`night-action-panel`, `day-discussion-screen`,
`voting-screen`, `hunter-revenge-modal`), `role-reveal-screen`'s role card, and the lobby's
`settings-modal`. Out of scope: `lobby-screen`'s general layout/flow, `game-over-screen`'s
structure (recolor only), any audio.

**Explicitly not carried over from the mockup**: the Tone.js ambience toggle, and the
"Test Next Character Identity" button (a demo affordance with no equivalent in a real game — roles
are fixed once assigned).

**Tokens**: replace `game-shell.scss`'s current purple/blue palette with the mockup's day/night
pair — day `#f59e0b` (warm amber), night `#c084fc` (twilight purple) — as CSS custom properties
switched via a `[data-phase]` attribute (or a class) driven by the existing `isNight` computed,
rather than the mockup's imperative `style.setProperty` calls. Same tokens apply to `role-reveal-screen`'s
card and `settings-modal`, since both currently use ad hoc colors of their own.

**Role card**: `role-reveal-screen` gains the mockup's 3D flip interaction (front = mystery back,
tap/click flips to reveal role name/emoji/description) instead of a flat reveal.

**Settings modal**: restyled to the mockup's "Rules & Setup" look (same two sections — role
distribution, gameplay rules — the existing component already matches that structure 1:1), plus:

- A new "Discussion duration" number input (see §C).
- Reachable from the game-shell header at all times (see §D's access-control note below), not only
  from the lobby screen.
- All inputs `disabled` and both "Apply" buttons hidden whenever a game is in progress — read-only
  so players can still check "does the doctor self-protect" mid-round, matching your call that it
  should stay _visible_ but not editable while a game is running. Editable again once the lobby is
  back in `Open` status (pre-game, or after a rematch reopens it — see §D).

**Desktop "fit to screen"**: `game-shell` changes from `min-height: 100vh` to `height: 100vh`, with
the header fixed and the 3-column viewport (roster | stage | chat) filling the remainder; each
column scrolls internally rather than the page scrolling — matching the mockup's `overflow-hidden`
main region.

**Mobile**: adopt the mockup's natural single-column collapse (identity/role card → stats → phase
banner+countdown → player grid → chat), with the page free to scroll (chat plus a full roster won't
fit one mobile screen) — this replaces the current mobile CSS, not just its colors.

## B. Town chat

Backend is already fully built and requires **no changes**:
`POST /api/v1/game/chat/room`, `GET /api/v1/game/{roomCode}/chat/room`, and a `chat.room` SignalR
push (`{ senderId, text, sentAtUtc }`) on every send. Pack Chat is intentionally excluded from this
pass (per your call) — its disabled tab/copy in `game-shell` is untouched.

**Frontend**:

- Add `getRoomChat(roomCode)` / `sendRoomChatMessage(request)` to `GameApiService` (same base URL
  as the rest of that service — no new service file).
- Extend `WerewolfNotification` with `{ kind: 'chat.room'; senderId: string; text: string; sentAtUtc: string }`.
- `game-shell.ts`: fetch history via `getRoomChat` once, on mount of the "town" tab; append live
  messages arriving over `hub.notifications$`; resolve sender names via the existing
  `gameState.playerDisplayName(senderId)` helper; enable the Town Square input and wire its submit
  to `sendRoomChatMessage`. This doesn't participate in the version-gap resync (it isn't reflected in
  `GameStateResponse.Version` consumption) — the live push is authoritative for appends, matching how
  the backend already treats it.

## C. Discussion timer (visual only, host still advances manually)

**Backend**:

- `GameSettings` gains `DiscussionDurationSeconds` (int, default `120`), settable the same way as
  every other rule (via `UpdateGameSettings`).
- `GameState` gains `DayStartedAtUtc` (set in `Apply(DayStarted)` from `@event.StartedAtUtc`).
- `GetGameStateEndpoint`'s response gains `DiscussionDeadlineUtc` (`DateTime?`):
  `DayStartedAtUtc + Settings.DiscussionDurationSeconds` when `Phase == DayDiscussion`, else `null`.

**Frontend**:

- `GameSettings`/`GameStateResponse` models gain the matching fields (`discussionDurationSeconds`,
  `discussionDeadlineUtc`).
- `settings-modal` gets the duration input described in §A.
- `day-discussion-screen` runs a `setInterval` countdown computed from `discussionDeadlineUtc`
  (mm:ss, matching the mockup's clock), stopping at `00:00` with a "time's up" indicator. The host's
  "Advance to Voting" button behavior is unchanged — this is a shared clock, not an enforcement
  mechanism.
- **Sync**: no new SignalR event. The existing `day.started` push already triggers a
  `GetGameState` refetch (version-gap resync); that refetch is where every client picks up the new
  `discussionDeadlineUtc`, so all clients count down from the same server timestamp with no extra
  wiring.

## D. Rematch: keep everyone in the room, start a new round

Today, starting a game fires `LobbyClosed` (`LobbyStatus.Closed`) with no way back, and
`GameState` is looked up by `RoomCode` via Marten's natural-key mechanism (`[NaturalKey]`/
`[NaturalKeySource]`, resolved through `[ReadAggregate("RoomCode")]`/`[WriteAggregate("RoomCode")]`)
— which maps a `RoomCode` to exactly one `GameState` stream. This needs new backend behavior, not
just a UI change.

**Backend**:

- New event `LobbyReopened` (`Status: Closed → Open`), new endpoint
  `POST /api/v1/lobby/rematch { roomCode, requestedBy }`:
    - Validate: caller is host, lobby `Status == Closed`.
    - Effect: `Status = Open`, every non-host player's `IsReady` reset to `false` (host stays ready,
      same convention as `LobbyCreated`). Role distribution and settings carry over unchanged (host
      can still edit them before starting round 2, same as round 1).
- Existing `POST /api/v1/lobby/start` then works for round 2+ exactly as it does today once the
  lobby is `Open` again and players ready up — no new start endpoint needed.
- **`GameState` natural-key reassignment**: `StartGameEndpoint` already calls
  `session.Events.StartStream<GameState>(newGameId, new GameStarted { RoomCode = lobby.RoomCode, ... })`
  for round 1. For round 2, this call repeats with a _different_ `newGameId` but the _same_
  `RoomCode` natural-key value. This needs verifying against Marten's actual natural-key semantics
  during implementation (does registering the same natural key value against a new stream
  re-point `[ReadAggregate("RoomCode")]"/[WriteAggregate("RoomCode")]` lookups to the new stream, or
  does the unique constraint reject it?) — if it rejects it, fall back to a small pointer read model
  (`RoomCode → current GameId`) that `GetGameStateEndpoint` and friends resolve through instead of
  `FetchLatest<GameState, RoomCode>`. Either way, the natural-key value is never reused as a lookup
  key by two _simultaneously live_ streams — only sequentially, after the previous game has ended.
- **Logs reset for free**: `ChatLogView` and `GameLogView` are already keyed by `GameId`, not
  `RoomCode` — a fresh `GameId` per round means round 2's chat and game log start empty with no
  explicit clearing needed.

**Frontend**:

- `game-over-screen`'s "Return to lobby / rematch" button changes from `router.navigate(['/'])`
  (which currently boots everyone back to the home screen) to calling a new `lobbyApi.rematch(...)`
  and staying on the room. Only the host actually triggers the reopen; non-host players just see the
  lobby reappear once `lobby.updated` resyncs them (existing mechanism).
- On successful rematch, the client must reset local game-state tracking so the next round's
  `GameStarted`/version numbers (which restart from a fresh `GameState.Version`) aren't mistaken for
  "not newer than what I already have": `GameStateService` needs a reset path (clear `gameState`,
  `hasSeenRoleReveal`, and `lastKnownVersion` — the same three things `stopSync()` already resets)
  triggered off the reopen, so `currentView()` falls back to `'lobby'` immediately rather than
  showing a stale `GameOver` screen until the next event happens to arrive.
- `settings-modal`'s editability (per §A) naturally re-enables once `lobby.status === 'Open'` again.

## Explicitly out of scope

- Sound / Tone.js ambience.
- Pack Chat wiring (stays disabled).
- Auto-advancing the Day Discussion phase when the timer hits zero (visual-only, per your call).
- Any change to `lobby-screen`'s overall structure or `game-over-screen`'s layout beyond recoloring
  and the rematch button's behavior.
