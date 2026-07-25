# i18n-translatable game log — design

## Context

`GET /api/v1/game/{roomCode}/log` (backing the FE's "View full game log" button, shown on the
Game Over screen) currently returns pre-formatted English sentences with player GUIDs
string-substituted for display names server-side. The backend's own code comment on this
endpoint calls it **"Test/debugging-only"** — it was never designed as a real player-facing
feature, but the FE's Game Over screen uses it as one, and the baked-English strings can't be
translated to Vietnamese (or any other locale) without re-parsing English prose.

This spec upgrades it into a real, structured, translatable endpoint — dropping the debug-only
framing — and moves player-name resolution to the frontend, which already has a
`playerId → displayName` map (`room-shell.ts`) built for other purposes and shouldn't need a
second, server-side, string-`.Replace()`-based mechanism to do the same job.

This is cross-repo work: a backend data-model + endpoint change in `../werewolf`, and a frontend
rendering change here, joined by a shared wire contract.

## Wire contract

Mirrors the CloudEvents-style `{ type, data }` envelope the SignalR hub already uses (see
`CLAUDE.md`), rather than inventing a second envelope convention:

```ts
// GET /api/v1/game/{roomCode}/log
type GameLogEntry = { type: string; data: Record<string, string | number | boolean | null> };
type GameLogResponse = { roomCode: string; gameId: string; entries: GameLogEntry[] };
```

`type` is the snake_case alias of the backend's event type name (matching the hub's existing
`type` convention). `data` carries raw values only — player **ids**, not names; night/day
numbers; cause strings; booleans — never a pre-formatted sentence fragment.

## Entry catalog

One row per `GameLogViewProjection.Apply` overload in `../werewolf/src/Application/Werewolf/ReadModels/GameLogView.cs`. `id` fields below are player ids the frontend resolves to display names via its existing lookup; everything else passes through as-is.

| `type`                      | `data` fields                                      | EN translation (`gameLog.*`)                                                                                                                                                                                                              |
| --------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `game_started`              | `startedAtUtc`                                     | "The village stirs to life."                                                                                                                                                                                                              |
| `role_assigned`             | `playerId`, `role`                                 | "{{name}} was assigned the role of {{role}}." (role via existing `roles.*`)                                                                                                                                                               |
| `night_started`             | `nightNumber`                                      | "Night {{n}} began."                                                                                                                                                                                                                      |
| `cupid_paired_lovers`       | `cupidPlayerId`, `firstPlayerId`, `secondPlayerId` | "{{cupid}} (Cupid) paired {{first}} and {{second}} as lovers."                                                                                                                                                                            |
| `seer_inspection_performed` | `seerPlayerId`, `targetPlayerId`, `isWerewolf`     | "{{seer}} (Seer) inspected {{target}} and saw they {{result}} a werewolf." (`result` resolved to a sub-key, not raw boolean, so word order/grammar can differ per locale)                                                                 |
| `doctor_protection_chosen`  | `doctorPlayerId`, `protectedPlayerId`              | "{{doctor}} (Doctor) protected {{target}}."                                                                                                                                                                                               |
| `werewolf_target_locked`    | `targetPlayerId` (nullable)                        | "The werewolves locked their target: {{target}}." / "The werewolves locked in: no kill tonight." (two keys, picked by null-check, not one key with a conditional inside the string)                                                       |
| `witch_heal_used`           | `witchPlayerId`                                    | "{{witch}} (Witch) used the heal potion."                                                                                                                                                                                                 |
| `witch_poison_used`         | `witchPlayerId`, `targetPlayerId`                  | "{{witch}} (Witch) poisoned {{target}}."                                                                                                                                                                                                  |
| `witch_passed`              | `witchPlayerId`                                    | "{{witch}} (Witch) passed."                                                                                                                                                                                                               |
| `day_started`               | `dayNumber`                                        | "Day {{n}} began."                                                                                                                                                                                                                        |
| `voting_started`            | —                                                  | "Voting began."                                                                                                                                                                                                                           |
| `vote_cast`                 | `voterPlayerId`, `targetPlayerId` (nullable)       | "{{voter}} voted for {{target}}." / "{{voter}} abstained." (two keys, same null-check pattern)                                                                                                                                            |
| `voting_closed`             | —                                                  | "Voting closed."                                                                                                                                                                                                                          |
| `player_died`               | `playerId`, `cause`                                | "{{name}} died ({{cause}})." (`cause` resolved through a `gameLog.causes.*` sub-map — the backend's raw cause string, e.g. `"werewolf"`/`"poison"`/`"hunterRevenge"`, must not render untranslated the same way the faction-name bug did) |
| `player_lynched`            | `playerId`                                         | "{{name}} was lynched."                                                                                                                                                                                                                   |
| `no_lynch_occurred`         | —                                                  | "No one was lynched."                                                                                                                                                                                                                     |
| `hunter_revenge_pending`    | `hunterPlayerId`                                   | "{{hunter}} (Hunter) is deciding on a revenge shot."                                                                                                                                                                                      |
| `hunter_revenge_shot_fired` | `hunterPlayerId`, `targetPlayerId`                 | "{{hunter}} (Hunter) shot {{target}} in revenge."                                                                                                                                                                                         |
| `hunter_revenge_declined`   | `hunterPlayerId`                                   | "{{hunter}} (Hunter) declined to take revenge."                                                                                                                                                                                           |
| `game_ended`                | `winningFaction`                                   | "The game ended. {{faction}} won!" (faction via existing `factions.*`)                                                                                                                                                                    |

Vietnamese equivalents follow the same pattern as the `factions.*`/`roles.*` keys already added —
written during implementation, not enumerated here, so a translation pass can happen in one place
against the finished English copy instead of drifting from a spec written before the wording was final.

## Backend changes (`../werewolf`)

- `GameLogView.cs`: add `public record GameLogEntry { public required string Type { get; init; }
public required Dictionary<string, object?> Data { get; init; } }` and change `Entries` from
  `List<string>` to `List<GameLogEntry>`. A plain dictionary (not a typed union per event) keeps
  every `Apply` overload a one-line object initializer, matches how the SignalR hub's own `data`
  payloads are already untyped on the wire, and needs no new type per event for what's a
  read-only, write-once-per-event-type record. Rewrite each `Apply`/`Create` overload to build a
  `GameLogEntry` instead of an interpolated string.
- `GetGameLogEndpoint.cs`: drop the `PlayerDirectoryProjection` lookup + `.Replace()` loop
  entirely (no longer needed — the frontend resolves names). Update `GameLogResponse.Entries` to
  `List<GameLogEntry>`. Remove the "Test/debugging-only" comment; add a comment reflecting its
  real role backing the Game Over screen's log.
- `GameLogViewProjection.VERSION` bump (the stored document shape changes) — existing games'
  string-array logs are incompatible with the new structured shape; confirm with the async daemon
  rebuild behavior already documented for this codebase rather than assuming.

## Frontend changes (this repo)

- `src/app/core/models/game.model.ts` (or wherever `GameLogResponse` is typed today): update to
  `GameLogEntry[]`.
- New `src/app/core/utils/game-log.util.ts`: a `Record<string, (data, playerName, translate) => string>`
  (or equivalent) mapping each `type` to its rendering, mirroring the table above — resolving
  `*PlayerId` fields through the same `playerName()` helper `room-shell.ts` already has for live
  notifications, and roles/factions/causes through their respective translation sub-keys.
- `public/i18n/en.json` / `vi.json`: new `gameLog` (and `gameLog.causes`) sections per the table.
- `room-shell.ts`'s `viewLogAction()`/`logEntries` signal: map each `GameLogEntry` through the new
  util instead of passing raw strings straight to `room-action-panel`'s `logEntries` input (which
  stays `string[]` — the util still produces final display strings, just correctly localized ones).

## Doc sync (required by `CLAUDE.md`, same commit/PR)

- `GAME_FLOW.md` (this repo) — update `GameLogResponse`'s type definition (§8.4, the `GET
/api/v1/game/{roomCode}/log` row's shape).
- `docs/api-and-signalr-commands.md` — update the log endpoint's row.
- `../werewolf/GAME_FLOW.md` — same shape update, canonical copy.

## Out of scope

- No change to _which_ events get logged — the 21-entry catalog above is exactly what
  `GameLogView` already tracks today, just restructured.
- No pagination/streaming of the log (still one `GET`, full history, same as today).
- No change to Town Square/Pack/Grave chat — those are a separate system (`chat.room`/etc. SignalR
  notifications), unaffected by this.

## Testing

- Backend: existing `GameLogViewProjection` coverage (if any — check during planning) needs
  updating for the new shape; add assertions that `GameLogEntry.Type`/`Data` match expectations
  per event, not string content.
- Frontend: `full-game-happy-path.spec.ts` and `custom-rules-scenarios.spec.ts` already drive games
  to completion and could assert on `viewLogAction()`'s rendered output in both locales as a
  regression check.
- Manual: play a full game to Game Over in both EN and VI, open "View full game log", confirm
  every line is in the active locale with no raw English fragments, GUIDs, or untranslated enum
  values (the exact class of bug this design exists to prevent, per the faction-name fix earlier
  this session).
