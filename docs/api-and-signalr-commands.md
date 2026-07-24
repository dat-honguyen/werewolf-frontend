# Werewolf API & SignalR Command Reference

Source of truth: `../werewolf/src/Application` (Wolverine.HTTP endpoints + the SignalR hub).
Regenerate by hand if either changes — this is a snapshot, not generated.

## SignalR (inbound — client → hub)

Client connects to the hub at `environment.hubUrl` and invokes the single method
`ReceiveMessage(json)`, where `json` is a CloudEvents-style envelope:

```json
{
    "type": "send_room_chat_message",
    "data": { "roomCode": "...", "playerId": "...", "text": "..." }
}
```

`type` is the snake_case alias of the .NET record name (see `WerewolfHubService`).

| Wire type                | .NET command          | Payload                        | Handler                      | Notes                                                                                                                                                                                                                                   |
| ------------------------ | --------------------- | ------------------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `join_game_room`         | `JoinGameRoom`        | `roomCode`, `playerId?`        | `JoinGameRoomHandler`        | Subscribes the connection to the room group (and player group if `playerId` given). No ack.                                                                                                                                             |
| `leave_game_room`        | `LeaveGameRoom`       | `roomCode`, `playerId?`        | `LeaveGameRoomHandler`       | Unsubscribes from the same groups. No ack.                                                                                                                                                                                              |
| `send_room_chat_message` | `SendRoomChatMessage` | `roomCode`, `playerId`, `text` | `SendRoomChatMessageHandler` | Appends a `RoomChatMessageSent` event to `LobbyState`. Invalid sends (not a room member, empty/oversized text) are silently dropped — no error is relayed back on this transport. Moved off `POST /api/v1/game/chat/room` (2026-07-20). |

## SignalR (outbound — server → client push)

Every push is a `PlayerNotification` envelope: `{ kind, payload, stateVersion? }`, delivered to
either the whole room group (`room:{roomCode}`) or a single player's group
(`room:{roomCode}:player:{playerId}`). `stateVersion` (when present) is `GameState.Version` —
clients treat it as "there's something newer than what I have" and re-fetch
`GetGameStateEndpoint` rather than trusting the payload as authoritative.

| `kind`            | Triggering event                                     | Scope                  | Payload                             |
| ----------------- | ---------------------------------------------------- | ---------------------- | ----------------------------------- |
| `game.started`    | `GameStarted`                                        | room                   | `{ gameId }`                        |
| `player.died`     | `PlayerDied`                                         | room                   | `{ playerId, cause, role? }`        |
| `player.lynched`  | `PlayerLynched`                                      | room                   | `{ playerId, role? }`               |
| `seer.result`     | `SeerInspectionPerformed`                            | player (the Seer)      | `{ targetPlayerId, isWerewolf }`    |
| `vote.cast`       | `VoteCast`                                           | room                   | `{ voterPlayerId, targetPlayerId }` |
| `day.started`     | `DayStarted`                                         | room                   | `{ dayNumber }`                     |
| `night.started`   | `NightStarted`                                       | room                   | `{ nightNumber }`                   |
| `night.narration` | (any night-role-turn event)                          | room                   | `{ step, text }`                    |
| `night.turn`      | (any night-role-turn event)                          | player (role holder)   | `{ role, prompt }`                  |
| `hunter.pending`  | `HunterRevengePending`/`ShotFired`/`Declined`        | room                   | —                                   |
| `hunter.turn`     | `HunterRevengePending`/`ShotFired`/`Declined`        | player (queued hunter) | —                                   |
| `voting.started`  | `VotingStarted`                                      | room                   | —                                   |
| `game.ended`      | `GameEnded`                                          | room                   | `{ winningFaction, roles }`         |
| `chat.room`       | `RoomChatMessageSent`                                | room                   | `{ senderId, text, sentAtUtc }`     |
| `lobby.updated`   | `NotifyRoomUpdated` (from `RoomLobbyViewProjection`) | room                   | `{ }` (just `stateVersion`)         |

Not pushed at all: werewolf pack coordination (who's voting for whom) and Cupid's lovers pairing —
living werewolves poll `GET /api/v1/game/{roomCode}/werewolf/votes` and paired players poll
`GET /api/v1/game/{roomCode}/lovers` instead, to avoid leaking pack/pairing membership via SignalR
group fan-out. **Confirmed design decision (2026-07-20) — not an oversight, don't "fix" it by adding
a push.** A private per-player push is provably safe (`seer.result`/`night.turn`/`hunter.turn` already
work that way), but the poll-and-404 design keeps "is this caller a pack member" decided in exactly
one auditable place with a leak-proof response shape; a push version would re-decide that on every
vote change and leave a trail in logs/APM instead. See `../werewolf/GAME_FLOW.md`'s §7 note for the
full writeup. Pack chat (`chat.pack`) also stays HTTP-only (`SendPackChatMessage`) — out of scope for
the Town Square SignalR migration. Grave chat (`chat.grave`, dead-players-only) follows the same
poll-and-404 posture as pack chat, for the same reason (leaking "who's dead" via a group push).

## HTTP API

All routes are `Wolverine.HTTP` endpoints under `/api/v1`.

### Lobby

| Method | Route                      | Endpoint                         |
| ------ | -------------------------- | -------------------------------- |
| POST   | `/api/v1/lobby`            | `CreateLobbyEndpoint`            |
| POST   | `/api/v1/lobby/join`       | `JoinLobbyEndpoint`              |
| POST   | `/api/v1/lobby/leave`      | `LeaveLobbyEndpoint`             |
| POST   | `/api/v1/lobby/cancel`     | `CancelLobbyEndpoint`            |
| POST   | `/api/v1/lobby/kick`       | `KickPlayerEndpoint`             |
| POST   | `/api/v1/lobby/ready`      | `SetReadyEndpoint`               |
| POST   | `/api/v1/lobby/roles`      | `UpdateRoleDistributionEndpoint` |
| POST   | `/api/v1/lobby/settings`   | `UpdateGameSettingsEndpoint`     |
| POST   | `/api/v1/lobby/start`      | `StartGameEndpoint`              |
| POST   | `/api/v1/lobby/rematch`    | `RematchLobbyEndpoint`           |
| GET    | `/api/v1/lobby/open`       | `BrowseLobbiesEndpoint`          |
| GET    | `/api/v1/lobby/{roomCode}` | `GetLobbyEndpoint`               |

### Game

| Method | Route                                    | Endpoint                                                                   |
| ------ | ---------------------------------------- | -------------------------------------------------------------------------- |
| GET    | `/api/v1/game/{roomCode}`                | `GetGameStateEndpoint`                                                     |
| GET    | `/api/v1/game/{roomCode}/log`            | `GetGameLogEndpoint`                                                       |
| GET    | `/api/v1/game/{roomCode}/lovers`         | `GetLoversEndpoint`                                                        |
| GET    | `/api/v1/game/{roomCode}/werewolf/votes` | `GetWerewolfVotesEndpoint`                                                 |
| GET    | `/api/v1/game/{roomCode}/witch/target`   | `GetWitchTargetEndpoint`                                                   |
| GET    | `/api/v1/game/{roomCode}/chat/room`      | `GetRoomChatEndpoint` (history only — sending moved to SignalR, see above) |
| GET    | `/api/v1/game/{roomCode}/chat/pack`      | `GetPackChatEndpoint`                                                      |
| POST   | `/api/v1/game/chat/pack`                 | `SendPackChatMessageEndpoint`                                              |
| GET    | `/api/v1/game/{roomCode}/chat/grave`     | `GetGraveChatEndpoint`                                                     |
| POST   | `/api/v1/game/chat/grave`                | `SendGraveChatMessageEndpoint`                                             |
| POST   | `/api/v1/game/cupid`                     | `SubmitCupidPairingEndpoint`                                               |
| POST   | `/api/v1/game/werewolf/vote`             | `SubmitWerewolfVoteEndpoint`                                               |
| POST   | `/api/v1/game/doctor/protect`            | `SubmitDoctorProtectionEndpoint`                                           |
| POST   | `/api/v1/game/seer/inspect`              | `SubmitSeerInspectionEndpoint`                                             |
| POST   | `/api/v1/game/witch/heal`                | `UseWitchHealPotionEndpoint`                                               |
| POST   | `/api/v1/game/witch/poison`              | `UseWitchPoisonPotionEndpoint`                                             |
| POST   | `/api/v1/game/witch/pass`                | `PassWitchEndpoint`                                                        |
| POST   | `/api/v1/game/hunter/shoot`              | `SubmitHunterRevengeShotEndpoint`                                          |
| POST   | `/api/v1/game/hunter/pass`               | `PassHunterRevengeEndpoint`                                                |
| POST   | `/api/v1/game/voting/advance`            | `AdvanceToVotingEndpoint`                                                  |
| POST   | `/api/v1/game/vote`                      | `CastVoteEndpoint`                                                         |
| POST   | `/api/v1/game/voting/close`              | `CloseVotingEndpoint`                                                      |
| POST   | `/api/v1/game/quit`                      | `QuitGameEndpoint`                                                         |

### Misc

| Method | Route             | Endpoint             |
| ------ | ----------------- | -------------------- |
| GET    | `/api/v1/roles`   | `GetRolesEndpoint`   |
| GET    | `/api/v1/rules`   | `GetRulesEndpoint`   |
| GET    | `/api/v1/version` | `GetVersionEndpoint` |
