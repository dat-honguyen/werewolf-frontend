# Architecture

Short overview of how the game is put together and where it runs. For the exact API surface see
[`api-and-signalr-commands.md`](./api-and-signalr-commands.md) and [`../GAME_FLOW.md`](../GAME_FLOW.md).

## Overview

```
browser (Angular SPA)
   │  HTTPS: REST + SignalR (WebSocket)
   ▼
Cloudflare (DNS, TLS, cache)
   │  Cloudflare Tunnel (one per box, plaintext to localhost)
   ▼
homelab box (Debian, Podman, systemd)
   ├─ werewolf-fe   nginx serving the built Angular app   :3000
   ├─ werewolf-be   .NET API (WolverineFx + Marten)
   └─ postgres      event store + projections
```

Everything runs on the homelab. Nothing is hosted on AWS anymore (S3, CloudFront, EC2, ECR and SSM
were removed).

## Frontend

- Angular SPA, no SSR. One persistent room screen (`RoomShell`) whose content morphs with the game
  phase instead of routing between screens.
- `src/app/core/services/`: `GameApiService` and `LobbyApiService` for REST, `WerewolfHubService` for
  SignalR, `GameStateService` for client-side game state.
- SignalR uses a single hub method, `ReceiveMessage`, with a `{ type, data }` envelope. Commands go out
  through `sendCommand`; pushes come back on `notifications$`.
- Build configurations in `src/environments/`: `environment.ts` (dev), `environment.e2e.ts`,
  `environment.production.ts` and `environment.homelab.ts`. The Docker image uses the `homelab` one,
  which points at the homelab API host.
- i18n via `@ngx-translate`, files in `public/i18n/` (en, vi).

## Backend

- Sibling repo `../werewolf`: WolverineFx for messaging and HTTP endpoints, MartenDB for event sourcing
  on Postgres.
- The game is an event-sourced aggregate. Endpoints and SignalR commands append events; projections
  build the read models the client fetches, and notifications are pushed over the hub.
- Canonical contract: the backend's `GAME_FLOW.md`. This repo keeps a synced copy.

## Deploy

Both repos use the same flow, in `.github/workflows/deploy-homelab.yml`, triggered by publishing a
GitHub Release (or manually):

1. GitHub-hosted runner builds the Docker image and pushes it to GHCR
   (`ghcr.io/dat-honguyen/werewolf-frontend` / `werewolf-be`), tagged `latest` and the commit SHA.
2. A self-hosted runner on the homelab (label `homelab`) runs `podman pull` and restarts the
   `werewolf-fe` / `werewolf-be` user systemd service.

The release tag becomes the version shown in the UI (`src/environments/version.ts`, written at build
time). The frontend image is a multi-stage build: Node builds the app, nginx serves it with long-lived
caching for hashed assets and short `must-revalidate` caching for `index.html` and `i18n/*`
(see `nginx.conf`).

## Gotchas

- Cloudflare is not purged on deploy. After a release, a stale `index.html` can be served until the
  edge cache expires; purge manually if it matters.
- Night-role "already acted" state is client-side only, except for the Witch. See `CLAUDE.md`.
