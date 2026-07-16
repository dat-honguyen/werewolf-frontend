# LUNARIS Redesign + Chat/Timer/Rematch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the live game view to the LUNARIS mockup (desktop fit-to-screen, mobile matching the mockup's natural collapse), and wire up three real gaps it implies: Town Square chat, a discussion-phase countdown, and rematch-in-the-same-room after a game ends.

**Architecture:** Two sibling repos. `werewolf` (.NET/Marten/Wolverine event-sourced backend) gets three small additive changes: a settings field + a computed deadline (timer), and a new lobby-reopen event + endpoint (rematch). `werewolf-frontend` (Angular, signals-based) gets matching model/service additions and wires them into already-existing-but-stubbed UI (`game-shell`'s disabled chat, a settings modal that already has the right shape, a day-discussion screen with no countdown at all).

**Tech Stack:** Backend: C#, Wolverine.Http declarative aggregates, Marten event sourcing, Wolverine.SignalR. Frontend: Angular (standalone components, signals, new `@if`/`@switch`/`@for` control-flow syntax), RxJS, plain SCSS (BEM-ish, one file per component).

## Global Constraints

- Ignore sound entirely — no Tone.js, no ambience toggle, nothing audio-related is ported from the mockup.
- Backend repo root: `C:\Users\CCDT\source\werewolf`. Bring the stack up/down: `.claude/skills/run-werewolf/driver.sh {up,down,status}` (`up` rebuilds; run `down` then `up` to pick up code changes). `dotnet` executable: `/home/dat98/.dotnet/dotnet`.
- After changing any handler chain (new event handler, new command endpoint), regenerate Wolverine's ahead-of-time codegen: `dotnet run -- codegen write` from `src/Application/`.
- No backend automated test project exists in this repo — verify backend changes with `curl`, following the existing convention in `scripts/manual_playthrough.md`, not by adding an xunit project.
- Keep `GAME_FLOW.md` (backend repo root) in sync whenever an endpoint, notification shape, or rule changes — this is an explicit repo convention (`claude.md`).
- A record field embedded inside an **already-persisted event** (e.g. `GameSettings` inside `GameStarted`) must never be marked `required` when added after the fact — events already in the store won't carry it, and `required` throws on deserializing those older events. Give it a plain default instead.
- Frontend repo root: `C:\Users\CCDT\source\werewolf-frontend`. Run tests: `npm test`. Run dev server: `npm start` (serves at `https://localhost:4200` per existing `localhost.pem`/`localhost-key.pem`, talking to `environment.apiBaseUrl = https://localhost:5000`).
- Frontend components use Angular's signal-based `input()`/`output()`/`signal()`/`computed()` APIs and the `@if`/`@switch`/`@for` template control-flow syntax — match this, don't introduce `*ngIf`/`@Input()` decorators.
- The role-reveal 3D flip card, the classic/bloody shared theme tokens (`--color-gold`, `--color-bg-void`, etc. under `src/app/styles/`), and `role-card`/`animated-card` already exist and already do what the mockup's role card does — **do not touch them**. The mockup's day/night amber/purple palette only replaces `game-shell.scss`'s own locally-scoped tokens (already isolated there from a prior mockup pass), not the shared theme.

---

## Group 1 — Backend: Discussion timer

### Task 1: Add `DiscussionDurationSeconds` to `GameSettings`

**Files:**

- Modify: `src/Application/Werewolf/Domain/WerewolfPrimitives.cs`

**Interfaces:**

- Produces: `GameSettings.DiscussionDurationSeconds` (`int`, default `120`), read by Task 2's `GetGameStateEndpoint` change and by the frontend's `settings-modal` (Task 11).

- [ ] **Step 1: Add the field to the `GameSettings` record**

In `WerewolfPrimitives.cs`, the `GameSettings` record currently ends with `WitchKnowsWerewolfTarget`:

```csharp
public record GameSettings
{
    public required bool RevealRoleOnDeath { get; init; }
    public required bool DoctorCanSelfProtect { get; init; }
    public required bool WerewolfRequiresConsensus { get; init; }
    public required bool WerewolfCanTargetWerewolf { get; init; }
    public required bool WerewolfCanVoteNoKill { get; init; }
    public required bool WitchSinglePotionPerNight { get; init; }
    public required int MinPlayers { get; init; }
    public required bool AllowForceStart { get; init; }

    /// <summary>
    /// If true, the Witch is told which player the werewolves locked onto before she decides whether
    /// to heal/poison/pass (the classic tabletop rule). If false, she must decide blind.
    /// </summary>
    public required bool WitchKnowsWerewolfTarget { get; init; }

    public static GameSettings Default() => new()
    {
        RevealRoleOnDeath = true,
        DoctorCanSelfProtect = true,
        WerewolfRequiresConsensus = true,
        WerewolfCanTargetWerewolf = false,
        WerewolfCanVoteNoKill = false,
        WitchSinglePotionPerNight = false,
        MinPlayers = 5,
        AllowForceStart = false,
        WitchKnowsWerewolfTarget = true
    };
```

Change it to:

```csharp
public record GameSettings
{
    public required bool RevealRoleOnDeath { get; init; }
    public required bool DoctorCanSelfProtect { get; init; }
    public required bool WerewolfRequiresConsensus { get; init; }
    public required bool WerewolfCanTargetWerewolf { get; init; }
    public required bool WerewolfCanVoteNoKill { get; init; }
    public required bool WitchSinglePotionPerNight { get; init; }
    public required int MinPlayers { get; init; }
    public required bool AllowForceStart { get; init; }

    /// <summary>
    /// If true, the Witch is told which player the werewolves locked onto before she decides whether
    /// to heal/poison/pass (the classic tabletop rule). If false, she must decide blind.
    /// </summary>
    public required bool WitchKnowsWerewolfTarget { get; init; }

    /// <summary>
    /// How long the Day Discussion phase's client-side countdown runs for, in seconds. Purely a
    /// shared clock -- the host still advances to Voting manually (see AdvanceToVotingEndpoint);
    /// nothing here enforces a transition. Not `required`: this field was added after `GameSettings`
    /// started being embedded in the already-persisted `GameStarted` event, so older events replayed
    /// from the store won't carry it and must fall back to this default instead of throwing.
    /// </summary>
    public int DiscussionDurationSeconds { get; init; } = 120;

    public static GameSettings Default() => new()
    {
        RevealRoleOnDeath = true,
        DoctorCanSelfProtect = true,
        WerewolfRequiresConsensus = true,
        WerewolfCanTargetWerewolf = false,
        WerewolfCanVoteNoKill = false,
        WitchSinglePotionPerNight = false,
        MinPlayers = 5,
        AllowForceStart = false,
        WitchKnowsWerewolfTarget = true,
        DiscussionDurationSeconds = 120
    };
```

- [ ] **Step 2: Rebuild to confirm it compiles**

Run (inside the backend dev environment): `cd src/Application && /home/dat98/.dotnet/dotnet build`
Expected: `Build succeeded.`

- [ ] **Step 3: Commit**

```bash
git add src/Application/Werewolf/Domain/WerewolfPrimitives.cs
git commit -m "Add configurable discussion duration to GameSettings"
```

---

### Task 2: Expose `DiscussionDeadlineUtc` from `GetGameStateEndpoint`

**Files:**

- Modify: `src/Application/Werewolf/Game/GameState.cs`
- Modify: `src/Application/Werewolf/Game/GetGameState/GetGameStateEndpoint.cs`

**Interfaces:**

- Consumes: `GameSettings.DiscussionDurationSeconds` (Task 1).
- Produces: `GameState.DayStartedAtUtc` (`DateTime?`); `GameStateResponse.DiscussionDeadlineUtc` (`DateTime?`), consumed by the frontend's `day-discussion-screen` (Task 10).

- [ ] **Step 1: Track when Day Discussion started, on the aggregate**

In `GameState.cs`, add a property next to the other phase-tracking fields:

```csharp
    public int NightNumber { get; set; }
    public int DayNumber { get; set; }
```

becomes:

```csharp
    public int NightNumber { get; set; }
    public int DayNumber { get; set; }

    /// <summary>
    /// When the current Day Discussion phase began -- used to compute
    /// <see cref="GetGameState.GameStateResponse.DiscussionDeadlineUtc"/>. Null outside
    /// DayDiscussion (or before any day has started).
    /// </summary>
    public DateTime? DayStartedAtUtc { get; set; }
```

Then update `Apply(DayStarted)`:

```csharp
    public void Apply(DayStarted @event)
    {
        Version++;
        DayNumber = @event.DayNumber;
        Phase = GamePhase.DayDiscussion;
    }
```

becomes:

```csharp
    public void Apply(DayStarted @event)
    {
        Version++;
        DayNumber = @event.DayNumber;
        DayStartedAtUtc = @event.StartedAtUtc;
        Phase = GamePhase.DayDiscussion;
    }
```

- [ ] **Step 2: Compute and return the deadline from `GetGameStateEndpoint`**

In `GetGameStateEndpoint.cs`, add the field to `GameStateResponse`:

```csharp
public record GameStateResponse
{
    public required string RoomCode { get; init; }
    public required GamePhase Phase { get; init; }
    public required int NightNumber { get; init; }
    public required int DayNumber { get; init; }
    public required List<GamePlayerDto> Players { get; init; }
    public LoversPair? Lovers { get; init; }
    public required Guid? WerewolfLockedTarget { get; init; }
    public required List<Guid> PendingHunterRevenge { get; init; }
    public GameResult? Result { get; init; }
    public Role? CurrentNightRole { get; init; }
    public string? NightPrompt { get; init; }
```

add right after `NightPrompt`:

```csharp
    public Role? CurrentNightRole { get; init; }
    public string? NightPrompt { get; init; }

    /// <summary>
    /// When the current Day Discussion phase's shared countdown runs out, for clients to render a
    /// synced clock from. Null outside DayDiscussion. Purely informational -- the host still
    /// advances to Voting manually via AdvanceToVotingEndpoint.
    /// </summary>
    public DateTime? DiscussionDeadlineUtc { get; init; }
```

Then in `Handle`, compute it:

```csharp
        return new GameStateResponse
        {
            RoomCode = state.RoomCode.Value,
            Phase = state.Phase,
            NightNumber = state.NightNumber,
            DayNumber = state.DayNumber,
            Players = state.Players.Values
                .Select(p => new GamePlayerDto { PlayerId = p.PlayerId, Role = p.Role, IsAlive = p.IsAlive })
                .ToList(),
            Lovers = state.Lovers,
            WerewolfLockedTarget = state.CurrentNight.WerewolfLockedTarget,
            PendingHunterRevenge = state.PendingHunterRevenge.ToList(),
            Result = state.Result,
            CurrentNightRole = NightNarrator.RoleFor(nightStep),
            NightPrompt = nightStep == NightRoleStep.Complete ? null : NightNarrator.Prompt(nightStep),
            DiscussionDeadlineUtc = state.Phase == GamePhase.DayDiscussion && state.DayStartedAtUtc is { } startedAt
                ? startedAt.AddSeconds(state.Settings.DiscussionDurationSeconds)
                : null,
            Version = state.Version
        };
```

- [ ] **Step 3: Regenerate Wolverine codegen and rebuild**

```bash
cd src/Application && /home/dat98/.dotnet/dotnet run -- codegen write
/home/dat98/.dotnet/dotnet build
```

Expected: both succeed with no errors.

- [ ] **Step 4: Manually verify against a running stack**

```bash
.claude/skills/run-werewolf/driver.sh down
.claude/skills/run-werewolf/driver.sh up
```

Follow `scripts/manual_playthrough.md` up through Day Discussion starting, then:

```bash
curl -s https://localhost:5000/api/v1/game/<ROOM_CODE> | python3 -m json.tool
```

Expected: response includes `"discussionDeadlineUtc"` set to roughly 120 seconds after the day started, and `null` while `phase` is anything else (e.g. still `Night`).

- [ ] **Step 5: Update `GAME_FLOW.md`**

Add a line to the Day Discussion section of `GAME_FLOW.md` noting `GameStateResponse` now includes `discussionDeadlineUtc` (nullable, present only during `DayDiscussion`), computed from `GameSettings.DiscussionDurationSeconds`.

- [ ] **Step 6: Commit**

```bash
git add src/Application/Werewolf/Game/GameState.cs src/Application/Werewolf/Game/GetGameState/GetGameStateEndpoint.cs GAME_FLOW.md
git commit -m "Expose a synced Day Discussion countdown deadline from GetGameState"
```

---

## Group 2 — Backend: Rematch in the same room

### Task 3: Add `LobbyReopened` event and wire it into `LobbyState` + `RoomLobbyView`

**Files:**

- Modify: `src/Application/Werewolf/Lobby/LobbyEvents.cs`
- Modify: `src/Application/Werewolf/Lobby/LobbyState.cs`
- Modify: `src/Application/Werewolf/ReadModels/RoomLobbyView.cs`

**Interfaces:**

- Produces: `LobbyReopened` event; `LobbyState.Apply(LobbyReopened)` (sets `Status = LobbyStatus.Open`, resets every non-host player's `IsReady` to `false`); the matching `RoomLobbyView` projection update so the existing `lobby.updated` SignalR push still fires for this event (same mechanism every other lobby-state change already uses).
- Consumed by: Task 4's `RematchLobbyEndpoint`.

- [ ] **Step 1: Add the event**

In `LobbyEvents.cs`, add after `LobbyClosed`:

```csharp
public record LobbyClosed
{
    public required DateTime ClosedAtUtc { get; init; }
}

public record LobbyReopened
{
    public required Guid ReopenedBy { get; init; }
    public required DateTime ReopenedAtUtc { get; init; }
}

public record LobbyCancelled
```

(i.e. insert the new record between `LobbyClosed` and `LobbyCancelled`.)

- [ ] **Step 2: Apply it on `LobbyState`**

In `LobbyState.cs`, after `Apply(LobbyClosed)`:

```csharp
    public void Apply(LobbyClosed _)
    {
        Version++;
        Status = LobbyStatus.Closed;
    }
```

add:

```csharp
    public void Apply(LobbyClosed _)
    {
        Version++;
        Status = LobbyStatus.Closed;
    }

    /// <summary>
    /// Reopens a closed lobby for another round in the same room: everyone stays, but non-host
    /// ready flags reset (same convention as a freshly created lobby, where only the host starts
    /// ready) so the host can't immediately re-start before anyone's actually confirmed in.
    /// </summary>
    public void Apply(LobbyReopened _)
    {
        Version++;
        Status = LobbyStatus.Open;
        foreach (var playerId in Players.Keys.ToList())
        {
            if (playerId == HostPlayerId)
            {
                continue;
            }
            Players[playerId] = Players[playerId] with { IsReady = false };
        }
    }
```

- [ ] **Step 3: Mirror it on the `RoomLobbyView` read model**

In `RoomLobbyView.cs`, add after `Apply(IEvent<LobbyClosed> _, RoomLobbyView view)`:

```csharp
    public static RoomLobbyView Apply(IEvent<LobbyClosed> _, RoomLobbyView view) =>
        view with { Status = LobbyStatus.Closed };
```

becomes:

```csharp
    public static RoomLobbyView Apply(IEvent<LobbyClosed> _, RoomLobbyView view) =>
        view with { Status = LobbyStatus.Closed };

    public static RoomLobbyView Apply(IEvent<LobbyReopened> @event, RoomLobbyView view)
    {
        var players = new Dictionary<Guid, RoomLobbyPlayerView>(view.Players);
        foreach (var (playerId, player) in view.Players)
        {
            if (playerId == view.HostPlayerId)
            {
                continue;
            }
            players[playerId] = player with { IsReady = false };
        }
        return view with { Status = LobbyStatus.Open, Players = players };
    }
```

Then add `LobbyReopened` to the `RaiseSideEffects` switch so the existing `lobby.updated` notification still fires:

```csharp
                case GameStarting:
                case LobbyCancelled:
                case LobbyClosed:
```

becomes:

```csharp
                case GameStarting:
                case LobbyCancelled:
                case LobbyClosed:
                case LobbyReopened:
```

- [ ] **Step 4: Build**

```bash
cd src/Application && /home/dat98/.dotnet/dotnet build
```

Expected: `Build succeeded.`

- [ ] **Step 5: Commit**

```bash
git add src/Application/Werewolf/Lobby/LobbyEvents.cs src/Application/Werewolf/Lobby/LobbyState.cs src/Application/Werewolf/ReadModels/RoomLobbyView.cs
git commit -m "Add LobbyReopened event for rematch support"
```

---

### Task 4: Add `RematchLobbyEndpoint`

**Files:**

- Create: `src/Application/Werewolf/Lobby/RematchLobby/RematchLobbyEndpoint.cs`

**Interfaces:**

- Consumes: `LobbyReopened` (Task 3), `LobbyCommandSupport.ValidateHost` (existing helper).
- Produces: `POST /api/v1/lobby/rematch`, consumed by the frontend's `LobbyApiService.rematch(...)` (Task 7/8).

- [ ] **Step 1: Write the endpoint**

Mirror `CancelLobbyEndpoint.cs`'s shape exactly, but validate the opposite lobby status:

```csharp
using Application.Werewolf.Domain;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using System;
using System.Threading;

namespace Application.Werewolf.Lobby.RematchLobby;

public record RematchLobby
{
    public required RoomCode RoomCode { get; init; }
    public required Guid RequestedBy { get; init; }
}

/// <summary>
/// Reopens a closed lobby (one whose game already ended) so the same room can play another round
/// without anyone re-joining by room code. Role distribution and settings carry over unchanged from
/// the previous round; only ready flags reset (see LobbyState.Apply(LobbyReopened)). The next
/// StartGame call then creates a brand-new GameState stream (fresh GameId), so that round's chat
/// and game log start empty automatically -- both are keyed by GameId, not RoomCode.
/// </summary>
public static class RematchLobbyEndpoint
{
    public static ProblemDetails Validate(RematchLobby command, [ReadAggregate("RoomCode")] LobbyState state, CancellationToken cancellationToken)
    {
        if (state.Status != LobbyStatus.Closed)
        {
            return new ProblemDetails { Status = StatusCodes.Status400BadRequest, Title = "Lobby is not closed -- can't start a rematch." };
        }

        foreach (var error in LobbyCommandSupport.ValidateHost(state, command.RequestedBy))
        {
            return new ProblemDetails { Status = StatusCodes.Status400BadRequest, Title = error };
        }

        return WolverineContinue.NoProblems;
    }

    [WolverinePost("/api/v1/lobby/rematch")]
    public static Events Handle(RematchLobby command, [WriteAggregate("RoomCode")] LobbyState state) =>
        [new LobbyReopened { ReopenedBy = command.RequestedBy, ReopenedAtUtc = DateTime.UtcNow }];
}
```

- [ ] **Step 2: Regenerate codegen and build**

```bash
cd src/Application
/home/dat98/.dotnet/dotnet run -- codegen write
/home/dat98/.dotnet/dotnet build
```

Expected: both succeed.

- [ ] **Step 3: Commit**

```bash
git add src/Application/Werewolf/Lobby/RematchLobby/RematchLobbyEndpoint.cs
git commit -m "Add POST /api/v1/lobby/rematch to reopen a closed lobby"
```

---

### Task 5: Verify the full rematch round-trip, including the `GameState` natural-key reassignment

This is the riskiest part of the plan: `StartGameEndpoint` calls
`session.Events.StartStream<GameState>(newGameId, new GameStarted { RoomCode = lobby.RoomCode, ... })`
for round 1. A rematch means calling it again with a _different_ `newGameId` but the _same_
`RoomCode` natural-key value, which has never been exercised before in this codebase. This task
verifies it actually works before any frontend code depends on it.

**Files:**

- Modify: `scripts/manual_playthrough.md` (append a "Rematch" section)

- [ ] **Step 1: Bring the stack up fresh**

```bash
.claude/skills/run-werewolf/driver.sh down
.claude/skills/run-werewolf/driver.sh up
```

- [ ] **Step 2: Play a full game to completion**

Follow `scripts/manual_playthrough.md` (or run `python3 scripts/play_full_game.py`) through to `GameEnded`. Note the room code (`ROOM1`) and confirm via:

```bash
curl -s https://localhost:5000/api/v1/game/ROOM1 | python3 -m json.tool
```

Expected: `"phase": "GameOver"`, a non-null `"result"`.

- [ ] **Step 3: Reopen the lobby**

```bash
curl -s -X POST https://localhost:5000/api/v1/lobby/rematch \
  -H "Content-Type: application/json" \
  -d '{"roomCode":"ROOM1","requestedBy":"<HOST_PLAYER_ID>"}'
```

Expected: `200 OK`, empty body.

```bash
curl -s https://localhost:5000/api/v1/lobby/ROOM1 | python3 -m json.tool
```

Expected: `"status": "Open"`, host's `isReady: true`, every other player's `isReady: false`, `roleDistribution`/`settings` unchanged from round 1.

- [ ] **Step 4: Ready up and start round 2**

```bash
curl -s -X POST https://localhost:5000/api/v1/lobby/ready \
  -H "Content-Type: application/json" \
  -d '{"roomCode":"ROOM1","playerId":"<SOME_PLAYER_ID>","isReady":true}'
# repeat for every non-host player, then:
curl -s -X POST https://localhost:5000/api/v1/lobby/start \
  -H "Content-Type: application/json" \
  -d '{"roomCode":"ROOM1","requestedBy":"<HOST_PLAYER_ID>","forceStart":false}'
```

**This is the critical check.** Expected: `200 OK` with a new `gameId` different from round 1's. If instead this throws (a natural-key/unique-constraint violation surfaced as a 500), the `[NaturalKey]`/`[NaturalKeySource]` mechanism does **not** support reassigning a `RoomCode` to a new stream, and Task 4 needs a follow-up: introduce a small pointer read model (e.g. a `SingleStreamProjection`-backed `RoomActiveGame { RoomCode, CurrentGameId }` document updated whenever `GameStarted` fires) and change `GetGameStateEndpoint`/`GetRoomChatEndpoint`/`GetGameLogEndpoint`/`GetLoversEndpoint`/`GetWerewolfVotesEndpoint`/`GetWitchTargetEndpoint`/`GetPackChatEndpoint` (everywhere that currently does `session.Events.FetchLatest<GameState, RoomCode>(roomCode, ...)`) to resolve the `GameId` through that pointer first, then `FetchLatest<GameState, Guid>(gameId, ...)`. `[NaturalKey]`/`[NaturalKeySource]` is a real `WolverineFx.Http.Marten` 6.16.0 feature (confirmed via `Directory.Packages.props`), not something custom to this repo -- if this fallback is needed, consult the `marten-aggregate-handler-workflow`, `wolverine-http-marten-integration`, and `marten-advanced-dynamic-consistency-boundary` skills (installed under `~/.claude/skills/`) for the supported pattern rather than reverse-engineering one; none of them document natural-key reassignment specifically as of this writing, so this may be genuinely unsupported. Do not proceed to Task 6+ until one of these two paths is confirmed working end-to-end.

- [ ] **Step 5: Confirm the new round's state is genuinely fresh**

```bash
curl -s https://localhost:5000/api/v1/game/ROOM1 | python3 -m json.tool
```

Expected: `"phase": "RoleAssignment"` (or `"Night"`, `"nightNumber": 1`), `"result": null` -- the _new_ game, not round 1's finished one.

```bash
curl -s https://localhost:5000/api/v1/game/ROOM1/chat/room | python3 -m json.tool
```

Expected: `"messages": []` -- empty, confirming the fresh `GameId` means a fresh `ChatLogView` with nothing carried over from round 1 (no explicit clearing needed).

- [ ] **Step 6: Document the flow**

Append a "Rematch" section to `scripts/manual_playthrough.md` with the exact `curl` sequence from Steps 3-4 above (fill in whichever real room code / player IDs your walkthrough used).

- [ ] **Step 7: Update `GAME_FLOW.md`**

Add a short section documenting: `POST /api/v1/lobby/rematch` (host-only, requires `Status == Closed`), the `LobbyReopened` event, and that it resets non-host ready flags but preserves role distribution and settings.

- [ ] **Step 8: Commit**

```bash
git add scripts/manual_playthrough.md GAME_FLOW.md
git commit -m "Verify and document the rematch round-trip"
```

---

## Group 3 — Frontend: models & services

### Task 6: Extend frontend models

**Files:**

- Modify: `src/app/core/models/lobby.model.ts`
- Modify: `src/app/core/models/game.model.ts`

**Interfaces:**

- Produces: `GameSettings.discussionDurationSeconds`; `RematchLobbyRequest`; `GameStateResponse.discussionDeadlineUtc`. Consumed by Tasks 7, 8, 10, 11, 12.

- [ ] **Step 1: Add `discussionDurationSeconds` to `GameSettings` and its default**

In `lobby.model.ts`:

```typescript
export interface GameSettings {
    revealRoleOnDeath: boolean;
    doctorCanSelfProtect: boolean;
    werewolfRequiresConsensus: boolean;
    werewolfCanTargetWerewolf: boolean;
    werewolfCanVoteNoKill: boolean;
    witchSinglePotionPerNight: boolean;
    minPlayers: number;
    allowForceStart: boolean;
    witchKnowsWerewolfTarget: boolean;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
    revealRoleOnDeath: true,
    doctorCanSelfProtect: true,
    werewolfRequiresConsensus: true,
    werewolfCanTargetWerewolf: false,
    werewolfCanVoteNoKill: false,
    witchSinglePotionPerNight: false,
    minPlayers: 5,
    allowForceStart: false,
    witchKnowsWerewolfTarget: true
};
```

becomes:

```typescript
export interface GameSettings {
    revealRoleOnDeath: boolean;
    doctorCanSelfProtect: boolean;
    werewolfRequiresConsensus: boolean;
    werewolfCanTargetWerewolf: boolean;
    werewolfCanVoteNoKill: boolean;
    witchSinglePotionPerNight: boolean;
    minPlayers: number;
    allowForceStart: boolean;
    witchKnowsWerewolfTarget: boolean;
    discussionDurationSeconds: number;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
    revealRoleOnDeath: true,
    doctorCanSelfProtect: true,
    werewolfRequiresConsensus: true,
    werewolfCanTargetWerewolf: false,
    werewolfCanVoteNoKill: false,
    witchSinglePotionPerNight: false,
    minPlayers: 5,
    allowForceStart: false,
    witchKnowsWerewolfTarget: true,
    discussionDurationSeconds: 120
};
```

- [ ] **Step 2: Add `RematchLobbyRequest`**

In `lobby.model.ts`, after `CancelLobbyRequest`:

```typescript
export interface CancelLobbyRequest {
    roomCode: string;
    requestedBy: string;
}
```

add:

```typescript
export interface CancelLobbyRequest {
    roomCode: string;
    requestedBy: string;
}
export interface RematchLobbyRequest {
    roomCode: string;
    requestedBy: string;
}
```

- [ ] **Step 3: Add `discussionDeadlineUtc` to `GameStateResponse`**

In `game.model.ts`:

```typescript
export interface GameStateResponse {
    roomCode: string;
    phase: GamePhase;
    nightNumber: number;
    dayNumber: number;
    players: { playerId: string; role: Role; isAlive: boolean }[];
    lovers: { firstPlayerId: string; secondPlayerId: string } | null;
    werewolfLockedTarget: string | null;
    pendingHunterRevenge: string[];
    result: {
        winningFaction: 'Villagers' | 'Werewolves' | 'Lovers' | 'Tanner';
        endedAtUtc: string;
        finalRoles: Record<string, Role>;
    } | null;
    currentNightRole: Role | null;
    nightPrompt: string | null;
    version: number;
}
```

add `discussionDeadlineUtc` after `nightPrompt`:

```typescript
currentNightRole: Role | null;
nightPrompt: string | null;
/** ISO timestamp the Day Discussion countdown runs out at. Null outside DayDiscussion. Purely a
 * shared clock for display -- the host still advances to Voting manually. */
discussionDeadlineUtc: string | null;
version: number;
```

- [ ] **Step 4: Add chat request/response types**

In `game.model.ts`, after `GameLogResponse`:

```typescript
export interface GameLogResponse {
    roomCode: string;
    gameId: string;
    entries: string[];
}
```

add:

```typescript
export interface GameLogResponse {
    roomCode: string;
    gameId: string;
    entries: string[];
}

export interface SendRoomChatMessageRequest {
    roomCode: string;
    playerId: string;
    text: string;
}
export interface ChatMessageResponse {
    senderId: string;
    senderDisplayName: string;
    text: string;
    sentAtUtc: string;
}
export interface ChatMessagesResponse {
    messages: ChatMessageResponse[];
}
```

- [ ] **Step 5: Run the existing frontend test suite to confirm nothing broke**

```bash
npm test
```

Expected: all existing specs still pass (these are additive interface changes; `game-state.service.spec.ts`'s `makeState` helper builds partial objects via spread, so it needs updating -- see Step 6).

- [ ] **Step 6: Fix `makeState` in the existing spec to satisfy the now-larger `GameStateResponse` type**

In `src/app/core/services/game-state.service.spec.ts`:

```typescript
function makeState(overrides: Partial<GameStateResponse>): GameStateResponse {
    return {
        roomCode: 'PQXR7K',
        phase: 'Night',
        nightNumber: 1,
        dayNumber: 0,
        players: [],
        lovers: null,
        werewolfLockedTarget: null,
        pendingHunterRevenge: [],
        result: null,
        ...overrides
    };
}
```

becomes (adding the four fields TypeScript would otherwise flag as missing -- `currentNightRole`, `nightPrompt`, `discussionDeadlineUtc`, `version` -- note the first two were already implicitly required and this spec was relying on the object being widened before use; make them explicit now that the type has grown):

```typescript
function makeState(overrides: Partial<GameStateResponse>): GameStateResponse {
    return {
        roomCode: 'PQXR7K',
        phase: 'Night',
        nightNumber: 1,
        dayNumber: 0,
        players: [],
        lovers: null,
        werewolfLockedTarget: null,
        pendingHunterRevenge: [],
        result: null,
        currentNightRole: null,
        nightPrompt: null,
        discussionDeadlineUtc: null,
        version: 0,
        ...overrides
    };
}
```

- [ ] **Step 7: Run tests again**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/app/core/models/lobby.model.ts src/app/core/models/game.model.ts src/app/core/services/game-state.service.spec.ts
git commit -m "Add discussion-timer, chat, and rematch model types"
```

---

### Task 7: Add chat methods to `GameApiService` and a rematch method to `LobbyApiService`

**Files:**

- Modify: `src/app/core/services/game-api.service.ts`
- Modify: `src/app/core/services/lobby-api.service.ts`

**Interfaces:**

- Consumes: `SendRoomChatMessageRequest`, `ChatMessagesResponse`, `RematchLobbyRequest` (Task 6).
- Produces: `GameApiService.getRoomChat(roomCode)`, `GameApiService.sendRoomChatMessage(request)`, `LobbyApiService.rematch(request)`. Consumed by Task 9 (chat wiring) and Task 12 (rematch UI).

- [ ] **Step 1: Add chat methods to `GameApiService`**

In `game-api.service.ts`, update the import block:

```typescript
import {
    AdvanceToVotingRequest,
    CastVoteRequest,
    CloseVotingRequest,
    GameLogResponse,
    GameStateResponse,
    LoversResponse,
    PassHunterRevengeRequest,
    PassWitchRequest,
    QuitGameRequest,
    SubmitCupidPairingRequest,
    SubmitDoctorProtectionRequest,
    SubmitHunterRevengeShotRequest,
    SubmitSeerInspectionRequest,
    SubmitWerewolfVoteRequest,
    UseWitchHealPotionRequest,
    UseWitchPoisonPotionRequest,
    WerewolfVotesResponse,
    WitchTargetResponse
} from '../models/game.model';
```

becomes:

```typescript
import {
    AdvanceToVotingRequest,
    CastVoteRequest,
    ChatMessagesResponse,
    CloseVotingRequest,
    GameLogResponse,
    GameStateResponse,
    LoversResponse,
    PassHunterRevengeRequest,
    PassWitchRequest,
    QuitGameRequest,
    SendRoomChatMessageRequest,
    SubmitCupidPairingRequest,
    SubmitDoctorProtectionRequest,
    SubmitHunterRevengeShotRequest,
    SubmitSeerInspectionRequest,
    SubmitWerewolfVoteRequest,
    UseWitchHealPotionRequest,
    UseWitchPoisonPotionRequest,
    WerewolfVotesResponse,
    WitchTargetResponse
} from '../models/game.model';
```

Then add methods after `getWitchTarget`:

```typescript
    /** 404s unless `playerId` is a living Witch. `targetPlayerId` is always null unless the game's
     * WitchKnowsWerewolfTarget setting is on. */
    getWitchTarget(roomCode: string, playerId: string): Observable<WitchTargetResponse> {
        return this.http.get<WitchTargetResponse>(
            `${this.baseUrl}/${roomCode}/witch/target?playerId=${encodeURIComponent(playerId)}`
        );
    }
}
```

becomes:

```typescript
    /** 404s unless `playerId` is a living Witch. `targetPlayerId` is always null unless the game's
     * WitchKnowsWerewolfTarget setting is on. */
    getWitchTarget(roomCode: string, playerId: string): Observable<WitchTargetResponse> {
        return this.http.get<WitchTargetResponse>(
            `${this.baseUrl}/${roomCode}/witch/target?playerId=${encodeURIComponent(playerId)}`
        );
    }

    getRoomChat(roomCode: string): Observable<ChatMessagesResponse> {
        return this.http.get<ChatMessagesResponse>(`${this.baseUrl}/${roomCode}/chat/room`);
    }

    sendRoomChatMessage(request: SendRoomChatMessageRequest): Observable<void> {
        return this.http.post<void>(`${this.baseUrl}/chat/room`, request);
    }
}
```

- [ ] **Step 2: Add `rematch` to `LobbyApiService`**

In `lobby-api.service.ts`, update the import block:

```typescript
import {
    CancelLobbyRequest,
    CreateLobbyRequest,
    CreateLobbyResponse,
    JoinLobbyRequest,
    KickPlayerRequest,
    LeaveLobbyRequest,
    LocalLobbyState,
    OpenLobbySummary,
    SetReadyRequest,
    StartGameRequest,
    StartGameResponse,
    UpdateGameSettingsRequest,
    UpdateRoleDistributionRequest
} from '../models/lobby.model';
```

becomes:

```typescript
import {
    CancelLobbyRequest,
    CreateLobbyRequest,
    CreateLobbyResponse,
    JoinLobbyRequest,
    KickPlayerRequest,
    LeaveLobbyRequest,
    LocalLobbyState,
    OpenLobbySummary,
    RematchLobbyRequest,
    SetReadyRequest,
    StartGameRequest,
    StartGameResponse,
    UpdateGameSettingsRequest,
    UpdateRoleDistributionRequest
} from '../models/lobby.model';
```

Then add the method after `cancelLobby`:

```typescript
    cancelLobby(request: CancelLobbyRequest): Observable<void> {
        return this.http.post<void>(`${this.baseUrl}/cancel`, request);
    }

    startGame(request: StartGameRequest): Observable<StartGameResponse> {
        return this.http.post<StartGameResponse>(`${this.baseUrl}/start`, request);
    }
}
```

becomes:

```typescript
    cancelLobby(request: CancelLobbyRequest): Observable<void> {
        return this.http.post<void>(`${this.baseUrl}/cancel`, request);
    }

    startGame(request: StartGameRequest): Observable<StartGameResponse> {
        return this.http.post<StartGameResponse>(`${this.baseUrl}/start`, request);
    }

    rematch(request: RematchLobbyRequest): Observable<void> {
        return this.http.post<void>(`${this.baseUrl}/rematch`, request);
    }
}
```

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: pass (no existing specs cover these services directly, so this just confirms the build/type-checks are clean).

- [ ] **Step 4: Commit**

```bash
git add src/app/core/services/game-api.service.ts src/app/core/services/lobby-api.service.ts
git commit -m "Add chat and rematch API methods"
```

---

### Task 8: Add the `chat.room` notification kind

**Files:**

- Modify: `src/app/core/models/notification.model.ts`

**Interfaces:**

- Produces: `WerewolfNotification` variant `{ kind: 'chat.room'; senderId: string; text: string; sentAtUtc: string }`, consumed by Task 9.

- [ ] **Step 1: Add the variant**

In `notification.model.ts`:

```typescript
    | { kind: 'game.ended'; winningFaction: string; roles: Record<string, Role> }
    // Lobby kind/payload is unconfirmed against the real hub — server just needs to broadcast
    // this to the room group whenever the lobby aggregate changes (join/leave/kick/ready/
    // settings/roles/cancel); the client always re-fetches full state via GET, so no extra
    // payload fields are required.
    | { kind: 'lobby.updated' }
);
```

becomes:

```typescript
    | { kind: 'game.ended'; winningFaction: string; roles: Record<string, Role> }
    // Room chat is pushed with its full payload inline (unlike every other kind above, which treats
    // its payload as UI-only supplementary data) since GetRoomChatEndpoint's history fetch is only
    // called once on mount -- this is the sole source of live appends after that.
    | { kind: 'chat.room'; senderId: string; text: string; sentAtUtc: string }
    // Lobby kind/payload is unconfirmed against the real hub — server just needs to broadcast
    // this to the room group whenever the lobby aggregate changes (join/leave/kick/ready/
    // settings/roles/cancel); the client always re-fetches full state via GET, so no extra
    // payload fields are required.
    | { kind: 'lobby.updated' }
);
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/core/models/notification.model.ts
git commit -m "Add chat.room notification kind"
```

---

## Group 4 — Frontend: Town chat wiring

### Task 9: Wire Town Square chat into `game-shell`

**Files:**

- Modify: `src/app/shared/components/game-shell/game-shell.ts`
- Modify: `src/app/shared/components/game-shell/game-shell.html`
- Modify: `src/app/shared/components/game-shell/game-shell.scss`

**Interfaces:**

- Consumes: `GameApiService.getRoomChat`/`sendRoomChatMessage` (Task 7), `WerewolfHubService.notifications$` filtered to `kind: 'chat.room'` (Task 8), `GameStateService.playerDisplayName` (existing).

- [ ] **Step 1: Add chat state and wiring to `game-shell.ts`**

Update the imports and class:

```typescript
import { Component, computed, inject, signal } from '@angular/core';
import { GameStateService } from '../../../core/services/game-state.service';
import { PlayerIdentityService } from '../../../core/services/player-identity.service';
import { Avatar } from '../avatar/avatar';
import { Role } from '../../../core/models/role.model';
```

becomes:

```typescript
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GameApiService } from '../../../core/services/game-api.service';
import { GameStateService } from '../../../core/services/game-state.service';
import { PlayerIdentityService } from '../../../core/services/player-identity.service';
import { WerewolfHubService } from '../../../core/services/werewolf-hub.service';
import { Avatar } from '../avatar/avatar';
import { Role } from '../../../core/models/role.model';

interface ChatMessage {
    senderId: string;
    senderName: string;
    text: string;
    sentAtUtc: string;
}
```

Update the `@Component` decorator's `imports`:

```typescript
@Component({
    selector: 'app-game-shell',
    imports: [Avatar],
    templateUrl: './game-shell.html',
    styleUrl: './game-shell.scss'
})
```

becomes:

```typescript
@Component({
    selector: 'app-game-shell',
    imports: [Avatar, FormsModule],
    templateUrl: './game-shell.html',
    styleUrl: './game-shell.scss'
})
```

Update the class docblock (it currently says chat is visual-only -- that's no longer true) and add chat state/methods. Replace:

```typescript
/**
 * Persistent 3-column shell wrapping the active gameplay phases (night/day-discussion/voting/
 * hunter-revenge) -- header with phase/room info, an always-visible roster on the left, the
 * current phase's own component projected into the center, and a chat sidebar on the right.
 *
 * Chat is visual-only for now: no backend calls are wired up here (see SendRoomChatMessage /
 * SendPackChatMessage on the backend, built but intentionally not called from the client yet to
 * avoid extra load on a free-tier deployment).
 */
@Component({
    selector: 'app-game-shell',
    imports: [Avatar, FormsModule],
    templateUrl: './game-shell.html',
    styleUrl: './game-shell.scss'
})
export class GameShell {
    private readonly gameState = inject(GameStateService);
    private readonly playerIdentity = inject(PlayerIdentityService);

    readonly roomCode = this.gameState.roomCode;
    readonly chatTab = signal<ChatTab>('town');
```

with:

```typescript
/**
 * Persistent 3-column shell wrapping the active gameplay phases (night/day-discussion/voting/
 * hunter-revenge) -- header with phase/room info, an always-visible roster on the left, the
 * current phase's own component projected into the center, and a chat sidebar on the right.
 *
 * Town Square chat is fully wired (history fetch + live SignalR append + send). Pack Chat stays
 * visual-only for now: it's deliberately not pushed over SignalR server-side (see
 * SendPackChatMessage's backend docs), so wiring it up would need polling, out of scope here.
 */
@Component({
    selector: 'app-game-shell',
    imports: [Avatar, FormsModule],
    templateUrl: './game-shell.html',
    styleUrl: './game-shell.scss'
})
export class GameShell {
    private readonly gameState = inject(GameStateService);
    private readonly playerIdentity = inject(PlayerIdentityService);
    private readonly gameApi = inject(GameApiService);
    private readonly hub = inject(WerewolfHubService);

    readonly roomCode = this.gameState.roomCode;
    readonly chatTab = signal<ChatTab>('town');
    readonly townMessages = signal<ChatMessage[]>([]);
    readonly draftMessage = signal('');
```

Add a constructor to load history and subscribe to live messages, plus a `sendMessage` method. Insert right after the `selectChatTab` method at the end of the class:

```typescript
    selectChatTab(tab: ChatTab): void {
        this.chatTab.set(tab);
    }
}
```

becomes:

```typescript
    selectChatTab(tab: ChatTab): void {
        this.chatTab.set(tab);
    }

    constructor() {
        const roomCode = this.roomCode();
        if (roomCode) {
            this.gameApi.getRoomChat(roomCode).subscribe((response) => {
                this.townMessages.set(
                    response.messages.map((m) => ({
                        senderId: m.senderId,
                        senderName: m.senderDisplayName,
                        text: m.text,
                        sentAtUtc: m.sentAtUtc
                    }))
                );
            });
        }

        this.hub.notifications$.pipe(takeUntilDestroyed()).subscribe((notification) => {
            if (notification.kind !== 'chat.room') {
                return;
            }
            this.townMessages.update((messages) => [
                ...messages,
                {
                    senderId: notification.senderId,
                    senderName: this.gameState.playerDisplayName(notification.senderId),
                    text: notification.text,
                    sentAtUtc: notification.sentAtUtc
                }
            ]);
        });
    }

    sendTownMessage(): void {
        const roomCode = this.roomCode();
        const text = this.draftMessage().trim();
        if (!roomCode || !text) {
            return;
        }
        this.gameApi
            .sendRoomChatMessage({ roomCode, playerId: this.playerIdentity.playerId(), text })
            .subscribe();
        this.draftMessage.set('');
    }
}
```

- [ ] **Step 2: Update `game-shell.html`'s chat sidebar**

Replace:

```html
<aside class="game-shell__chat">
    <div class="game-shell__chat-tabs">
        <button
            type="button"
            class="game-shell__chat-tab"
            [class.game-shell__chat-tab--active]="chatTab() === 'town'"
            (click)="selectChatTab('town')"
        >
            Town Square
        </button>
        @if (canSeePackChat()) {
        <button
            type="button"
            class="game-shell__chat-tab game-shell__chat-tab--danger"
            [class.game-shell__chat-tab--active]="chatTab() === 'pack'"
            (click)="selectChatTab('pack')"
        >
            Pack Chat
        </button>
        }
    </div>

    <div class="game-shell__chat-history">
        <p class="game-shell__chat-disabled">
            Chat is disabled for now. Coordinate over voice or a group chat outside the app.
        </p>
    </div>

    <div class="game-shell__chat-input-area">
        <input type="text" placeholder="Chat is disabled for now" disabled />
    </div>
</aside>
```

with:

```html
<aside class="game-shell__chat">
    <div class="game-shell__chat-tabs">
        <button
            type="button"
            class="game-shell__chat-tab"
            [class.game-shell__chat-tab--active]="chatTab() === 'town'"
            (click)="selectChatTab('town')"
        >
            Town Square
        </button>
        @if (canSeePackChat()) {
        <button
            type="button"
            class="game-shell__chat-tab game-shell__chat-tab--danger"
            [class.game-shell__chat-tab--active]="chatTab() === 'pack'"
            (click)="selectChatTab('pack')"
        >
            Pack Chat
        </button>
        }
    </div>

    @if (chatTab() === 'town') {
    <div class="game-shell__chat-history">
        @for (message of townMessages(); track message.sentAtUtc + message.senderId) {
        <p class="game-shell__chat-message">
            <span class="game-shell__chat-sender">{{ message.senderName }}:</span>
            {{ message.text }}
        </p>
        }
    </div>

    <form class="game-shell__chat-input-area" (ngSubmit)="sendTownMessage()">
        <input
            type="text"
            placeholder="Speak to the town..."
            [ngModel]="draftMessage()"
            (ngModelChange)="draftMessage.set($event)"
            name="townMessage"
        />
    </form>
    } @else {
    <div class="game-shell__chat-history">
        <p class="game-shell__chat-disabled">
            Pack Chat isn't wired up yet. Coordinate over voice or a group chat outside the app.
        </p>
    </div>

    <div class="game-shell__chat-input-area">
        <input type="text" placeholder="Pack Chat is disabled for now" disabled />
    </div>
    }
</aside>
```

- [ ] **Step 3: Add message styling to `game-shell.scss`**

After the existing `&__chat-disabled` block:

```scss
&__chat-disabled {
    color: var(--text-muted);
    font-style: italic;
    font-size: 0.85rem;
    background: rgb(255 255 255 / 2%);
    padding: 0.5rem;
    border-radius: 0.25rem;
    border-left: 2px solid var(--text-muted);
}
```

add:

```scss
&__chat-disabled {
    color: var(--text-muted);
    font-style: italic;
    font-size: 0.85rem;
    background: rgb(255 255 255 / 2%);
    padding: 0.5rem;
    border-radius: 0.25rem;
    border-left: 2px solid var(--text-muted);
}

&__chat-message {
    margin: 0 0 0.6rem;
    font-size: 0.8rem;
    line-height: 1.4;
    color: var(--text-main);
}

&__chat-sender {
    font-weight: 700;
    color: var(--primary);
    margin-right: 0.3rem;
}
```

And remove the `input { ... cursor: not-allowed; }` styling that assumed a permanently-disabled input, replacing it with a normal enabled-input look:

```scss
&__chat-input-area {
    padding: 0.85rem;
    border-top: 1px solid var(--border);
    background: var(--bg-nested);

    input {
        width: 100%;
        background: var(--bg-main);
        border: 1px solid var(--border);
        border-radius: 0.375rem;
        padding: 0.6rem 0.75rem;
        color: var(--text-muted);
        outline: none;
        cursor: not-allowed;
    }
}
```

becomes:

```scss
&__chat-input-area {
    padding: 0.85rem;
    border-top: 1px solid var(--border);
    background: var(--bg-nested);
    display: flex;

    input {
        width: 100%;
        background: var(--bg-main);
        border: 1px solid var(--border);
        border-radius: 0.375rem;
        padding: 0.6rem 0.75rem;
        color: var(--text-main);
        outline: none;

        &:disabled {
            color: var(--text-muted);
            cursor: not-allowed;
        }

        &:focus {
            border-color: var(--primary);
        }
    }
}
```

- [ ] **Step 4: Manually verify in the browser**

```bash
npm start
```

Open two browser tabs/profiles joined to the same room, get both into an active game (any phase), and:

1. Confirm the Town Square tab shows an empty history (fresh room), not "Chat is disabled".
2. Send a message from tab A; confirm it appears in tab A's own history immediately after the round-trip, and appears in tab B's history via the live SignalR push without a manual refresh.
3. Reload tab B; confirm the message is still there (came from `getRoomChat` history fetch, not just the live push).
4. Confirm the Pack Chat tab (visible only if you're a living Werewolf) still shows its disabled placeholder and doesn't error.

- [ ] **Step 5: Commit**

```bash
git add src/app/shared/components/game-shell/game-shell.ts src/app/shared/components/game-shell/game-shell.html src/app/shared/components/game-shell/game-shell.scss
git commit -m "Wire up Town Square chat end-to-end"
```

---

## Group 5 — Frontend: Discussion countdown

### Task 10: Add the countdown to `day-discussion-screen`

**Files:**

- Modify: `src/app/features/room/day-discussion-screen/day-discussion-screen.ts`
- Modify: `src/app/features/room/day-discussion-screen/day-discussion-screen.html`
- Modify: `src/app/features/room/day-discussion-screen/day-discussion-screen.scss`

**Interfaces:**

- Consumes: `GameStateResponse.discussionDeadlineUtc` (Task 6).

- [ ] **Step 1: Compute the remaining seconds as a signal, ticking every second**

Update `day-discussion-screen.ts`:

```typescript
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GameApiService } from '../../../core/services/game-api.service';
import { GameStateService } from '../../../core/services/game-state.service';
import { PlayerIdentityService } from '../../../core/services/player-identity.service';
import { WerewolfHubService } from '../../../core/services/werewolf-hub.service';
import { PlayerCard } from '../../../shared/components/player-card/player-card';

interface LastDeath {
    playerId: string;
    cause: string;
}

@Component({
    selector: 'app-day-discussion-screen',
    imports: [PlayerCard],
    templateUrl: './day-discussion-screen.html',
    styleUrl: './day-discussion-screen.scss'
})
export class DayDiscussionScreen {
    private readonly gameApi = inject(GameApiService);
    private readonly gameState = inject(GameStateService);
    private readonly playerIdentity = inject(PlayerIdentityService);
    private readonly hub = inject(WerewolfHubService);

    readonly lastDeath = signal<LastDeath | null>(null);
    readonly state = this.gameState.gameState;

    readonly isHost = computed(
        () => this.gameState.lobby()?.hostPlayerId === this.playerIdentity.playerId()
    );

    constructor() {
        this.hub.notifications$.pipe(takeUntilDestroyed()).subscribe((notification) => {
            if (notification.kind === 'player.died') {
                this.lastDeath.set({ playerId: notification.playerId, cause: notification.cause });
            }
        });
    }
```

becomes:

```typescript
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GameApiService } from '../../../core/services/game-api.service';
import { GameStateService } from '../../../core/services/game-state.service';
import { PlayerIdentityService } from '../../../core/services/player-identity.service';
import { WerewolfHubService } from '../../../core/services/werewolf-hub.service';
import { PlayerCard } from '../../../shared/components/player-card/player-card';

interface LastDeath {
    playerId: string;
    cause: string;
}

@Component({
    selector: 'app-day-discussion-screen',
    imports: [PlayerCard],
    templateUrl: './day-discussion-screen.html',
    styleUrl: './day-discussion-screen.scss'
})
export class DayDiscussionScreen {
    private readonly gameApi = inject(GameApiService);
    private readonly gameState = inject(GameStateService);
    private readonly playerIdentity = inject(PlayerIdentityService);
    private readonly hub = inject(WerewolfHubService);

    readonly lastDeath = signal<LastDeath | null>(null);
    readonly state = this.gameState.gameState;
    readonly nowMs = signal(Date.now());

    readonly isHost = computed(
        () => this.gameState.lobby()?.hostPlayerId === this.playerIdentity.playerId()
    );

    /** Seconds left until `discussionDeadlineUtc`, floored at 0. Null when there's no deadline
     * (shouldn't happen while this screen is shown, but the field is nullable server-side). */
    readonly secondsRemaining = computed(() => {
        const deadline = this.state()?.discussionDeadlineUtc;
        if (!deadline) {
            return null;
        }
        const remainingMs = new Date(deadline).getTime() - this.nowMs();
        return Math.max(0, Math.floor(remainingMs / 1000));
    });

    readonly countdownDisplay = computed(() => {
        const seconds = this.secondsRemaining();
        if (seconds === null) {
            return null;
        }
        const mins = Math.floor(seconds / 60)
            .toString()
            .padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    });

    readonly timeIsUp = computed(() => this.secondsRemaining() === 0);

    constructor() {
        this.hub.notifications$.pipe(takeUntilDestroyed()).subscribe((notification) => {
            if (notification.kind === 'player.died') {
                this.lastDeath.set({ playerId: notification.playerId, cause: notification.cause });
            }
        });

        const intervalId = setInterval(() => this.nowMs.set(Date.now()), 1000);
        // No explicit teardown needed beyond this: DestroyRef isn't injected because the interval
        // just stops mattering once the component's gone (nothing it touches outlives the component,
        // unlike a subscription that could otherwise leak a callback into a shared service).
        // If a leak concern comes up in review, wrap in `inject(DestroyRef).onDestroy(() =>
        // clearInterval(intervalId))` instead of leaving this comment.
        void intervalId;
    }
```

- [ ] **Step 2: Show the countdown in the template**

Update `day-discussion-screen.html`:

```html
<div class="day-discussion-screen">
    <h1 class="phase-title">Day {{ state()?.dayNumber }} — Discuss</h1>

    @if (lastDeath(); as death) {
    <div class="day-discussion-screen__death">
        <app-player-card
            [displayName]="playerName(death.playerId)"
            [isAlive]="false"
            [isDying]="true"
        ></app-player-card>
        <p>{{ playerName(death.playerId) }} died last night ({{ death.cause }}).</p>
    </div>
    }

    <p class="day-discussion-screen__hint">Free-form chat/voice — no protocol here.</p>

    @if (isHost()) {
    <button type="button" class="day-discussion-screen__button" (click)="advanceToVoting()">
        Advance to Voting
    </button>
    }
</div>
```

becomes:

```html
<div class="day-discussion-screen">
    <h1 class="phase-title">Day {{ state()?.dayNumber }} — Discuss</h1>

    @if (countdownDisplay(); as countdown) {
    <div
        class="day-discussion-screen__countdown"
        [class.day-discussion-screen__countdown--expired]="timeIsUp()"
    >
        <span class="day-discussion-screen__countdown-label"
            >{{ timeIsUp() ? "Time's up" : 'Discussion ends in' }}</span
        >
        <span class="day-discussion-screen__countdown-clock">{{ countdown }}</span>
    </div>
    } @if (lastDeath(); as death) {
    <div class="day-discussion-screen__death">
        <app-player-card
            [displayName]="playerName(death.playerId)"
            [isAlive]="false"
            [isDying]="true"
        ></app-player-card>
        <p>{{ playerName(death.playerId) }} died last night ({{ death.cause }}).</p>
    </div>
    }

    <p class="day-discussion-screen__hint">Free-form chat/voice — no protocol here.</p>

    @if (isHost()) {
    <button type="button" class="day-discussion-screen__button" (click)="advanceToVoting()">
        Advance to Voting
    </button>
    }
</div>
```

- [ ] **Step 3: Style the countdown, matching the day/night amber accent**

Read `day-discussion-screen.scss` first to match its existing token usage, then add:

```scss
.day-discussion-screen {
    &__countdown {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        justify-content: center;
        padding: 0.6rem 1rem;
        margin-bottom: 1rem;
        background: var(--bg-nested, rgba(245, 158, 11, 0.08));
        border: 1px solid var(--accent-day, #f5a623);
        border-radius: 0.75rem;
        font-family: monospace;

        &--expired {
            border-color: var(--danger, #ff3b30);

            .day-discussion-screen__countdown-clock {
                color: var(--danger, #ff3b30);
            }
        }
    }

    &__countdown-label {
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-muted, #727c94);
    }

    &__countdown-clock {
        font-size: 1.1rem;
        font-weight: 700;
        color: var(--accent-day, #f5a623);
    }
}
```

(If `day-discussion-screen.scss` already declares a top-level `.day-discussion-screen { ... }` block, add these three nested rules inside it instead of duplicating the selector.)

- [ ] **Step 4: Manually verify**

```bash
npm start
```

Play through to Day Discussion and confirm the countdown appears, ticks down every second, and turns red / says "Time's up" at zero without breaking the "Advance to Voting" button for the host.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/room/day-discussion-screen/day-discussion-screen.ts src/app/features/room/day-discussion-screen/day-discussion-screen.html src/app/features/room/day-discussion-screen/day-discussion-screen.scss
git commit -m "Add synced discussion countdown to day-discussion-screen"
```

---

### Task 11: Add the discussion-duration input to `settings-modal`

**Files:**

- Modify: `src/app/features/room/lobby-screen/settings-modal/settings-modal.html`

**Interfaces:**

- Consumes: `GameSettings.discussionDurationSeconds` (Task 6); existing `gameSettingsDraft`/`setDraftSetting` (unchanged).

- [ ] **Step 1: Add the input**

In `settings-modal.html`, inside the "Game rules" section, after the "Min players" row:

```html
<label>
    Min players
    <input
        type="number"
        min="1"
        [ngModel]="gameSettingsDraft().minPlayers"
        (ngModelChange)="setDraftSetting('minPlayers', $event)"
    />
</label>
<label>
    <input
        type="checkbox"
        [ngModel]="gameSettingsDraft().allowForceStart"
        (ngModelChange)="setDraftSetting('allowForceStart', $event)"
    />
    Allow force start
</label>
```

becomes:

```html
<label>
    Min players
    <input
        type="number"
        min="1"
        [ngModel]="gameSettingsDraft().minPlayers"
        (ngModelChange)="setDraftSetting('minPlayers', $event)"
    />
</label>
<label>
    Discussion duration (seconds)
    <input
        type="number"
        min="30"
        step="30"
        [ngModel]="gameSettingsDraft().discussionDurationSeconds"
        (ngModelChange)="setDraftSetting('discussionDurationSeconds', $event)"
    />
</label>
<label>
    <input
        type="checkbox"
        [ngModel]="gameSettingsDraft().allowForceStart"
        (ngModelChange)="setDraftSetting('allowForceStart', $event)"
    />
    Allow force start
</label>
```

No `.ts` change is needed: `setDraftSetting<K extends keyof GameSettings>` is already generic over every `GameSettings` key, so it accepts `'discussionDurationSeconds'` automatically once Task 6 adds it to the interface.

- [ ] **Step 2: Manually verify**

```bash
npm start
```

Open the lobby settings modal, confirm the new field shows `120` by default, change it, click "Apply game settings", and confirm (via the Network tab or backend logs) the POST body includes `discussionDurationSeconds`.

- [ ] **Step 3: Commit**

```bash
git add src/app/features/room/lobby-screen/settings-modal/settings-modal.html
git commit -m "Add discussion duration input to settings modal"
```

---

## Group 6 — Frontend: Rematch UI + state reset

### Task 12: Reset `GameStateService` on rematch, and wire `game-over-screen`'s rematch button

**Files:**

- Modify: `src/app/core/services/game-state.service.ts`
- Modify: `src/app/features/room/game-over-screen/game-over-screen.ts`
- Modify: `src/app/features/room/game-over-screen/game-over-screen.html`

**Interfaces:**

- Consumes: `LobbyApiService.rematch` (Task 7).
- Produces: `GameStateService.resetForRematch()`, called from `game-over-screen`.

- [ ] **Step 1: Add `resetForRematch` to `GameStateService`**

In `game-state.service.ts`, add a public method mirroring the resets `stopSync()` already does, but without tearing down the SignalR subscription (the player stays connected to the room):

```typescript
    stopSync(): void {
        this.notificationsSubscription?.unsubscribe();
        this.notificationsSubscription = null;
        this.reconnectedSubscription?.unsubscribe();
        this.reconnectedSubscription = null;
        // Reset so a later room (rejoin, or a different room entirely) can't have its first
        // notification silently ignored against a stale version left over from this one.
        this.lastKnownVersion = 0;
        this.lastKnownLobbyVersion = 0;
    }
```

Add after it:

```typescript
    /**
     * Called right after a successful rematch (POST /api/v1/lobby/rematch): the finished game's
     * GameState.Version was however high it got, but round 2's fresh GameState stream restarts its
     * own Version count from scratch -- without this reset, resyncIfNewer would see round 2's early
     * versions as "not newer than what I already have" and silently ignore them, leaving currentView()
     * stuck showing the finished game's GameOver screen. hasSeenRoleReveal also needs to reset so
     * round 2's own role reveal isn't skipped.
     */
    resetForRematch(): void {
        this.gameState.set(null);
        this.hasSeenRoleReveal.set(false);
        this.lastKnownVersion = 0;
    }
```

- [ ] **Step 2: Wire the rematch button**

In `game-over-screen.ts`:

```typescript
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { GameApiService } from '../../../core/services/game-api.service';
import { GameStateService } from '../../../core/services/game-state.service';
import { PlayerIdentityService } from '../../../core/services/player-identity.service';
import { RoleCard } from '../../../shared/components/role-card/role-card';
import { PhaseTransition } from '../../../shared/components/phase-transition/phase-transition';
import { Role } from '../../../core/models/role.model';
```

becomes:

```typescript
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { GameApiService } from '../../../core/services/game-api.service';
import { GameStateService } from '../../../core/services/game-state.service';
import { LobbyApiService } from '../../../core/services/lobby-api.service';
import { PlayerIdentityService } from '../../../core/services/player-identity.service';
import { ToastService } from '../../../core/services/toast.service';
import { extractErrorMessage } from '../../../core/utils/http-error.util';
import { RoleCard } from '../../../shared/components/role-card/role-card';
import { PhaseTransition } from '../../../shared/components/phase-transition/phase-transition';
import { Role } from '../../../core/models/role.model';
```

Update the class:

```typescript
export class GameOverScreen {
    private readonly gameApi = inject(GameApiService);
    private readonly gameState = inject(GameStateService);
    private readonly playerIdentity = inject(PlayerIdentityService);
    private readonly router = inject(Router);
```

becomes:

```typescript
export class GameOverScreen {
    private readonly gameApi = inject(GameApiService);
    private readonly gameState = inject(GameStateService);
    private readonly lobbyApi = inject(LobbyApiService);
    private readonly playerIdentity = inject(PlayerIdentityService);
    private readonly toast = inject(ToastService);
    private readonly router = inject(Router);

    readonly isHost = computed(
        () => this.gameState.lobby()?.hostPlayerId === this.playerIdentity.playerId()
    );
```

Replace `returnToLobby` with two methods -- one for the host to trigger the rematch, one for anyone to leave entirely:

```typescript
    returnToLobby(): void {
        this.playerIdentity.clearActiveRoom();
        this.router.navigate(['/']);
    }
```

becomes:

```typescript
    /** Host-only: reopens the lobby for another round without leaving the room. Everyone else's
     * view flips back to the lobby screen on its own once the resulting `lobby.updated` push
     * resyncs them (existing mechanism -- see GameStateService.startSync). */
    startRematch(): void {
        const roomCode = this.gameState.roomCode();
        if (!roomCode) {
            return;
        }
        this.lobbyApi
            .rematch({ roomCode, requestedBy: this.playerIdentity.playerId() })
            .subscribe({
                next: () => {
                    this.gameState.resetForRematch();
                    void this.gameState.refreshLobby(roomCode);
                },
                error: (error: unknown) =>
                    this.toast.show(extractErrorMessage(error, 'Could not start a rematch.'), 'error')
            });
    }

    leaveRoom(): void {
        this.playerIdentity.clearActiveRoom();
        void this.router.navigate(['/']);
    }
```

- [ ] **Step 3: Update the template**

In `game-over-screen.html`:

```html
<div class="game-over-screen__actions">
    <button type="button" class="game-over-screen__button" (click)="viewLog()">
        View full game log
    </button>
    <button
        type="button"
        class="game-over-screen__button game-over-screen__button--primary"
        (click)="returnToLobby()"
    >
        Return to lobby / rematch
    </button>
</div>
```

becomes:

```html
<div class="game-over-screen__actions">
    <button type="button" class="game-over-screen__button" (click)="viewLog()">
        View full game log
    </button>
    @if (isHost()) {
    <button
        type="button"
        class="game-over-screen__button game-over-screen__button--primary"
        (click)="startRematch()"
    >
        Rematch in this room
    </button>
    }
    <button type="button" class="game-over-screen__button" (click)="leaveRoom()">Leave room</button>
</div>
```

- [ ] **Step 4: Manually verify with two players**

```bash
npm start
```

Play a game to completion with two browser tabs (host + one other player). Confirm:

1. Only the host tab shows "Rematch in this room".
2. Clicking it flips the host's own view to the lobby screen (not `game-over` anymore), with everyone's ready state reset except the host.
3. The other tab's view also flips to the lobby screen on its own (via `lobby.updated`), without needing a manual reload.
4. "Leave room" (visible to everyone) still returns to the home screen as before.
5. Starting round 2 from the lobby works, and the new game's phase/day/night numbers start fresh (not continuing from round 1).

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/game-state.service.ts src/app/features/room/game-over-screen/game-over-screen.ts src/app/features/room/game-over-screen/game-over-screen.html
git commit -m "Wire up rematch-in-the-same-room from the game-over screen"
```

---

### Task 13: Make `settings-modal` reachable and read-only during an active game

**Files:**

- Modify: `src/app/shared/components/game-shell/game-shell.ts`
- Modify: `src/app/shared/components/game-shell/game-shell.html`
- Modify: `src/app/features/room/lobby-screen/settings-modal/settings-modal.ts`
- Modify: `src/app/features/room/lobby-screen/settings-modal/settings-modal.html`

**Interfaces:**

- Consumes: existing `SettingsModal` component (already used stand-alone from `lobby-screen`).
- Produces: `SettingsModal`'s new `readOnly` input, consumed by `game-shell`.

- [ ] **Step 1: Add a `readOnly` input to `SettingsModal`**

In `settings-modal.ts`, add an input:

```typescript
export class SettingsModal {
    private readonly gameState = inject(GameStateService);
    private readonly lobbyApi = inject(LobbyApiService);
    private readonly playerIdentity = inject(PlayerIdentityService);
    private readonly toast = inject(ToastService);

    readonly closed = output<void>();
```

becomes:

```typescript
export class SettingsModal {
    private readonly gameState = inject(GameStateService);
    private readonly lobbyApi = inject(LobbyApiService);
    private readonly playerIdentity = inject(PlayerIdentityService);
    private readonly toast = inject(ToastService);

    readonly closed = output<void>();
    /** True while a game is in progress -- rules are locked in once assigned, so this shows
     * everyone the configured settings without letting anyone edit them. */
    readonly readOnly = input(false);
```

(add `input` to the `@angular/core` import alongside the existing `computed, inject, output, signal`).

- [ ] **Step 2: Disable inputs and hide "Apply" buttons in read-only mode**

In `settings-modal.html`, add `[disabled]="readOnly()"` to every `<input>` and wrap both "Apply" buttons in `@if (!readOnly())`. For example, the role distribution section:

```html
<button
    type="button"
    class="settings-modal__button settings-modal__button--primary"
    (click)="applyRoleDistribution()"
>
    Apply role distribution
</button>
```

becomes:

```html
@if (!readOnly()) {
<button
    type="button"
    class="settings-modal__button settings-modal__button--primary"
    (click)="applyRoleDistribution()"
>
    Apply role distribution
</button>
}
```

Apply the same `@if (!readOnly())` wrap to the "Apply game settings" button, and add `[disabled]="readOnly()"` to the role-count `<input type="number">` and every rule `<input>` (checkboxes, min-players, discussion-duration, allow-force-start) in the file.

- [ ] **Step 3: Make it reachable from `game-shell`'s header**

In `game-shell.ts`, add a `showSettings` signal (same pattern `lobby-screen.ts` already uses):

```typescript
    readonly roomCode = this.gameState.roomCode;
    readonly chatTab = signal<ChatTab>('town');
    readonly townMessages = signal<ChatMessage[]>([]);
    readonly draftMessage = signal('');
```

becomes:

```typescript
    readonly roomCode = this.gameState.roomCode;
    readonly chatTab = signal<ChatTab>('town');
    readonly townMessages = signal<ChatMessage[]>([]);
    readonly draftMessage = signal('');
    readonly showSettings = signal(false);
```

Add `SettingsModal` to the `@Component` imports:

```typescript
import { SettingsModal } from '../../../features/room/lobby-screen/settings-modal/settings-modal';
```

```typescript
@Component({
    selector: 'app-game-shell',
    imports: [Avatar, FormsModule, SettingsModal],
    templateUrl: './game-shell.html',
    styleUrl: './game-shell.scss'
})
```

- [ ] **Step 4: Add the header button and modal to `game-shell.html`**

In `game-shell.html`'s header, after the phase badge:

```html
<header class="game-shell__header">
    <div class="game-shell__phase">
        <span class="game-shell__phase-badge" [class.game-shell__phase-badge--night]="isNight()">
            {{ phaseLabel() }}
        </span>
    </div>
    <div class="game-shell__stats"></div>
</header>
```

becomes:

```html
<header class="game-shell__header">
    <div class="game-shell__phase">
        <span class="game-shell__phase-badge" [class.game-shell__phase-badge--night]="isNight()">
            {{ phaseLabel() }}
        </span>
    </div>
    <button type="button" class="game-shell__settings-button" (click)="showSettings.set(true)">
        ⚙️ Rules & Setup
    </button>
    <div class="game-shell__stats"></div>
</header>
```

And add the modal at the end of the file, before the closing `</div>` of `.game-shell`:

```html
        </aside>
    </div>
</div>
```

becomes:

```html
        </aside>
    </div>

    @if (showSettings()) {
        <app-settings-modal [readOnly]="true" (closed)="showSettings.set(false)"></app-settings-modal>
    }
</div>
```

- [ ] **Step 5: Style the header button**

In `game-shell.scss`, add near `&__stats`:

```scss
&__settings-button {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: var(--bg-nested);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    padding: 0.45rem 0.9rem;
    color: var(--text-main);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;

    &:hover {
        border-color: var(--primary);
    }
}
```

- [ ] **Step 6: Manually verify**

```bash
npm start
```

During an active game, click "Rules & Setup" in the header: confirm the modal opens showing current settings, every input is disabled, and neither "Apply" button is present. Confirm the lobby screen's own settings button (pre-game) is unaffected -- it doesn't pass `readOnly` at all, so it defaults to `false` and stays fully editable.

- [ ] **Step 7: Commit**

```bash
git add src/app/shared/components/game-shell/game-shell.ts src/app/shared/components/game-shell/game-shell.html src/app/shared/components/game-shell/game-shell.scss src/app/features/room/lobby-screen/settings-modal/settings-modal.ts src/app/features/room/lobby-screen/settings-modal/settings-modal.html
git commit -m "Make Rules & Setup reachable but read-only during an active game"
```

---

## Group 7 — Frontend: LUNARIS visual redesign

### Task 14: Swap `game-shell`'s day/night tokens to the LUNARIS palette

**Files:**

- Modify: `src/app/shared/components/game-shell/game-shell.scss`
- Modify: `src/app/shared/components/game-shell/game-shell.ts`
- Modify: `src/app/shared/components/game-shell/game-shell.html`

**Interfaces:**

- Produces: `[data-phase]` attribute on `.game-shell`'s host, driven by the existing `isNight` computed.

- [ ] **Step 1: Replace the hardcoded palette with day/night pairs**

In `game-shell.scss`, replace the token block:

```scss
.game-shell {
    --bg-main: #0a0b10;
    --bg-surface: #121420;
    --bg-nested: #1a1d30;
    --primary: #8a2be2;
    --accent-day: #f5a623;
    --accent-night: #2e5bff;
    --danger: #ff3b30;
    --success: #4cd964;
    --text-main: #e4e7eb;
    --text-muted: #727c94;
    --border: #23273a;
```

with:

```scss
.game-shell {
    // LUNARIS palette (werewolf_game_interface (2).html): warm amber by day, twilight purple by
    // night. --primary tracks whichever is active so existing rules referencing --primary (the
    // settings-button hover, chat tab underline, etc.) don't need per-phase overrides of their own.
    --bg-main: #0f1115;
    --bg-surface: #1a1d24;
    --bg-nested: #242932;
    --accent-day: #f59e0b;
    --accent-night: #c084fc;
    --primary: var(--accent-day);
    --danger: #ff3b30;
    --success: #4cd964;
    --text-main: #f1f3f4;
    --text-muted: #9aa0a6;
    --border: #2d323f;

    &[data-phase='night'] {
        --primary: var(--accent-night);
    }
```

- [ ] **Step 2: Drive `[data-phase]` from the existing `isNight` computed**

In `game-shell.html`, the root element:

```html
<div class="game-shell"></div>
```

becomes:

```html
<div class="game-shell" [attr.data-phase]="isNight() ? 'night' : 'day'"></div>
```

`game-shell.ts` needs no change here -- `isNight` already exists as a computed.

- [ ] **Step 3: Update the phase badge to use the new tokens**

The `&__phase-badge` rule currently hardcodes its own day/night colors independently of `--primary`:

```scss
&__phase-badge {
    background: rgb(245 166 35 / 15%);
    border: 1px solid var(--accent-day);
    color: var(--accent-day);
    padding: 0.35rem 0.9rem;
    border-radius: 999px;
    font-weight: 700;
    text-transform: uppercase;
    font-size: 0.8rem;
    letter-spacing: 0.05em;

    &--night {
        background: rgb(46 91 255 / 15%);
        border-color: var(--accent-night);
        color: var(--accent-night);
    }
}
```

becomes:

```scss
&__phase-badge {
    background: color-mix(in srgb, var(--accent-day) 15%, transparent);
    border: 1px solid var(--accent-day);
    color: var(--accent-day);
    padding: 0.35rem 0.9rem;
    border-radius: 999px;
    font-weight: 700;
    text-transform: uppercase;
    font-size: 0.8rem;
    letter-spacing: 0.05em;

    &--night {
        background: color-mix(in srgb, var(--accent-night) 15%, transparent);
        border-color: var(--accent-night);
        color: var(--accent-night);
    }
}
```

- [ ] **Step 4: Manually verify**

```bash
npm start
```

Load an active game in both Night and Day phases; confirm the phase badge, chat tab underline, settings button hover, and identity strip all shift between amber (day) and purple (night) consistently, with no leftover blue (`#2e5bff`) or the old purple (`#8a2be2`) anywhere.

- [ ] **Step 5: Commit**

```bash
git add src/app/shared/components/game-shell/game-shell.scss src/app/shared/components/game-shell/game-shell.html
git commit -m "Swap game-shell to the LUNARIS amber/purple day-night palette"
```

---

### Task 15: Desktop fit-to-screen layout for `game-shell`

**Files:**

- Modify: `src/app/shared/components/game-shell/game-shell.scss`

**Interfaces:** none (pure layout).

- [ ] **Step 1: Change the shell from `min-height: 100vh` to a fixed-height, internally-scrolling layout**

```scss
display: flex;
flex-direction: column;
min-height: 100vh;
background-color: var(--bg-main);
color: var(--text-main);
```

becomes:

```scss
display: flex;
flex-direction: column;
height: 100vh;
background-color: var(--bg-main);
color: var(--text-main);
overflow: hidden;
```

- [ ] **Step 2: Let the viewport fill remaining height and each column scroll independently**

```scss
&__viewport {
    flex: 1;
    display: grid;
    grid-template-columns: 260px 1fr 300px;

    @media (max-width: 900px) {
        grid-template-columns: 1fr;
    }
}
```

becomes:

```scss
&__viewport {
    flex: 1;
    display: grid;
    grid-template-columns: 260px 1fr 300px;
    min-height: 0; // without this, a flex/grid item won't shrink below its content's height,
    // which would defeat the point of `height: 100vh` on the shell above.

    @media (max-width: 900px) {
        grid-template-columns: 1fr;
        min-height: auto;
        overflow-y: auto;
    }
}
```

The three columns (`&__roster`, `&__stage`, `&__chat`) already have `overflow-y: auto` (roster, stage) or are flex columns that'll need it added (`&__chat`). Add it to `&__chat`:

```scss
&__chat {
    background-color: var(--bg-surface);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
}
```

becomes:

```scss
&__chat {
    background-color: var(--bg-surface);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden; // the history pane inside scrolls; the sidebar itself shouldn't

    @media (max-width: 900px) {
        overflow: visible;
    }
}
```

- [ ] **Step 2: Manually verify on desktop**

```bash
npm start
```

At a desktop viewport width (e.g. 1440×900), confirm: the page itself never scrolls (no scrollbar on `<body>`), the header stays put, and the roster/stage/chat columns each scroll independently when their content overflows (e.g. a long chat history, or many players in the roster).

- [ ] **Step 3: Commit**

```bash
git add src/app/shared/components/game-shell/game-shell.scss
git commit -m "Make game-shell fit the viewport on desktop with independently scrolling columns"
```

---

### Task 16: Mobile responsive collapse for `game-shell`

**Files:**

- Modify: `src/app/shared/components/game-shell/game-shell.scss`

**Interfaces:** none (pure layout). Depends on Task 15's `@media (max-width: 900px)` overrides already being in place.

- [ ] **Step 1: Confirm the collapse order matches the mockup**

The existing `@media (max-width: 900px) { grid-template-columns: 1fr; }` (from Task 15) already stacks `&__roster`, `&__stage`, `&__chat` vertically in DOM order. Check `game-shell.html`'s DOM order: roster, then stage, then chat. The mockup's mobile order is identity/role card → stats → phase banner+countdown → player grid → chat. `&__roster` (the "Villagers summary" list) corresponds to the mockup's stats/player-grid content, and `&__stage` (phase banner + the projected phase screen + identity strip) sits in between in this app's structure -- reordering the DOM would be a bigger change than the mockup implies for what's actually a different component structure (this app puts identity info in the stage, not a separate first card). Keep the existing DOM order (roster, stage, chat); this still produces "identity/stats-equivalent info first, phase content next, chat last" once stacked, which is the mockup's intent even though the exact card boundaries differ.

- [ ] **Step 2: Give the roster and chat sections a bounded height on mobile so chat doesn't get pushed off-screen by a long roster**

```scss
&__roster {
    background-color: var(--bg-surface);
    border-right: 1px solid var(--border);
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    overflow-y: auto;
}
```

becomes:

```scss
&__roster {
    background-color: var(--bg-surface);
    border-right: 1px solid var(--border);
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    overflow-y: auto;

    @media (max-width: 900px) {
        border-right: none;
        border-bottom: 1px solid var(--border);
        max-height: 40vh;
    }
}
```

And give the chat section a sensible minimum height so it's usable once stacked (it's the last section and would otherwise be squeezed to whatever's left):

```scss
&__chat {
    background-color: var(--bg-surface);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;

    @media (max-width: 900px) {
        overflow: visible;
    }
}
```

becomes:

```scss
&__chat {
    background-color: var(--bg-surface);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;

    @media (max-width: 900px) {
        overflow: visible;
        border-left: none;
        border-top: 1px solid var(--border);
        min-height: 50vh;
    }
}
```

- [ ] **Step 3: Make the header wrap sensibly on narrow screens**

The header already has `flex-wrap: wrap`. Confirm the new settings button (Task 13) doesn't force horizontal overflow: add `flex-wrap: wrap` behavior explicitly to `&__stats` if it doesn't already wrap (it inherits from the parent `flex-wrap`, so check in the browser rather than assuming).

- [ ] **Step 4: Manually verify on mobile**

```bash
npm start
```

Use browser dev tools' device toolbar (e.g. iPhone 12 Pro, 390×844) on an active game. Confirm: header wraps without horizontal scroll, roster/stage/chat stack vertically in that order, the roster doesn't consume more than ~40% of the viewport height, chat gets a reasonable amount of space and its input stays reachable without excessive scrolling, and this matches how the mockup itself would look at a narrow viewport (a single stacked column, not the fit-to-screen 3-column layout).

- [ ] **Step 5: Commit**

```bash
git add src/app/shared/components/game-shell/game-shell.scss
git commit -m "Tune game-shell's mobile stacked layout"
```

---

## Self-Review

**Spec coverage:**

- §A visual redesign: game-shell tokens (Task 14), desktop fit-to-screen (Task 15), mobile collapse (Task 16), settings-modal reachable + read-only (Task 13). Role-reveal-screen's flip card and the shared classic/bloody theme are explicitly out of scope (already built, confirmed while reading the codebase) — call this out as a correction to the original design doc's Task list, not a gap.
- §B Town chat: Tasks 7-9.
- §C Discussion timer: Tasks 1-2 (backend), 6, 10-11 (frontend).
- §D Rematch: Tasks 3-5 (backend), 6-7, 12-13 (frontend).
- Explicitly-out-of-scope items (sound, Pack Chat, auto-advance-on-expiry) are not implemented anywhere above — confirmed by absence.

**Placeholder scan:** no TBD/TODO markers; every step has concrete code or an exact command with expected output.

**Type consistency:** `GameSettings.discussionDurationSeconds` (Task 6) matches what Task 11's `settings-modal.html` binds to and what Task 1's backend field serializes as (camelCase over the wire, matching every other existing field in that interface). `GameStateResponse.discussionDeadlineUtc` (Task 6) matches Task 2's backend field name (`DiscussionDeadlineUtc` → camelCased) and what Task 10 reads. `ChatMessagesResponse`/`ChatMessageResponse` (Task 6) match Task 2's backend... (re-checked: Task 7's `getRoomChat` return type and Task 9's `.subscribe((response) => response.messages...)` usage line up field-for-field with the backend's `ChatMessagesResponse`/`ChatMessageResponse` from `GetRoomChatEndpoint.cs`). `RematchLobbyRequest` (Task 6) matches Task 7's `LobbyApiService.rematch` parameter and Task 4's backend `RematchLobby` command shape (`roomCode`/`requestedBy` → `RoomCode`/`RequestedBy`).
