# CLAUDE.md

Angular client for Werewolf, a browser-based social-deduction party game, built against the sibling
[`werewolf`](../werewolf) backend (WolverineFx + MartenDB) over HTTP + SignalR. See
[`README.md`](./README.md) for features and dev setup.

## Docs must stay in sync with the API

**Any change to which HTTP endpoint this app calls, its request/response shape, or a SignalR
command/notification (wire type, payload, subscribe/send call) MUST update docs in the same
commit/PR** — not a follow-up. This applies whether the change originates here or you're adapting to
a backend change. Three places, all three need it:

- [`GAME_FLOW.md`](./GAME_FLOW.md) (repo root) — a synced copy of the backend's own `GAME_FLOW.md`;
  keep the _content_ identical (prettier will reformat emphasis markers/table alignment on commit,
  that's expected and fine).
- [`docs/api-and-signalr-commands.md`](./docs/api-and-signalr-commands.md) — the flat command-reference
  table (every HTTP route + every SignalR inbound/outbound command) that's the fastest lookup for
  "what can I call and what does it return" — deliberately duplicates GAME_FLOW.md's API surface for
  quick scanning, so it drifts out of sync just as easily if skipped.
- `../werewolf/GAME_FLOW.md` (sibling repo, canonical source) — if you're changing an endpoint or
  SignalR shape from the frontend side (e.g. discovering the backend contract needs to change too),
  the backend's own copy needs the same update, not just the two above.

## Git commits

**Never add a `Co-Authored-By` trailer (Claude or otherwise) to commits in this repo.** Commit
messages should read like any other commit here — no AI-attribution footer.

## Backend integration

- Base URL / hub URL: `src/environments/environment*.ts`.
- REST calls: `GameApiService`, `LobbyApiService` (`src/app/core/services/`).
- SignalR: `WerewolfHubService` — single hub method `ReceiveMessage`, CloudEvents-style envelope
  (`{ type, data }`), `type` is the snake_case alias of the backend's .NET command/event type name.
  Inbound commands (`join_game_room`, `send_room_chat_message`, ...) are sent via `sendCommand`;
  outbound pushes arrive on `notifications$`, keyed by `kind`.
- `e2e/start-backend.cjs` assumes `werewolf-frontend` and `werewolf` are checked out as sibling
  directories — this is also why doc paths above use `../werewolf/...`.
- Building the backend to sanity-check a `../werewolf` change: `cd ../werewolf && dotnet build
src/Application/Application.csproj`. There's only one test project there,
  `src/IntegrationTests` — search it before assuming an endpoint has coverage to update.

## Night-role "already acted" state doesn't survive a page reload

`RoomShell`'s per-night local signals (`actionsTaken`, `witchHealUsed`/`witchPoisonUsed`, `seerResult`,
`wolfLockedTarget`, `cupidFirstPick`, ...) are reset by an effect keyed on the current night number
(`room-shell.ts`, search `currentNightNumber()`) that also fires once on component init — so a full
page reload always forgets "have I already acted this night" for any role tracked purely client-side,
even though the backend (`NightActionsState.*Done` fields in `GameState.cs`) knows the true answer.
The Witch got fixed by adding `healPotionAvailable`/`poisonPotionAvailable`/`hasActedThisNight` to
`GET /witch/target`'s response and restoring local state from it on load (see `GetWitchTargetEndpoint`
and the `getWitchTarget` subscription in `room-shell.ts`) — the same gap likely still exists for Seer,
Cupid, and Werewolf and would need the same treatment (extend their existing `GET` endpoints, or add
one, with an "already acted" field) if reported.
