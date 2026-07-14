# Werewolf Angular frontend — full implementation plan

## Context

`werewolf-frontend/` currently only has `GAME_FLOW.md` (the backend integration spec) and a `.git`
dir — no app yet. Goal: scaffold an Angular app here using the **tooling config** from the sibling
`dat-honguyen.github.io` portfolio repo (Angular 22 standalone, Tailwind + SCSS, ESLint/
Prettier/Stylelint, Husky + lint-staged, Vitest) as the baseline, then implement the **full** game
flow described in `GAME_FLOW.md`: Lobby, Role Reveal, Night Action Panel, Day Discussion, Voting,
Hunter Revenge, Game Over — wired to the HTTP API (§4) and SignalR hub (§7).

Decisions already made with the user:

- Two environments: local (`http://localhost:5000`) and production
  (`https://api.werewolf.datisa.dev`).
- No deploy/wrangler setup for now — just `ng serve` / `ng build`.
- Premium animated fantasy card-game UI — a dark, moonlit digital tabletop in the spirit of
  Hearthstone/Inscryption (animated role reveals, interactive cards, cinematic phase/voting/death
  effects), not a neutral dashboard and not the portfolio's night-sky/nautical theme. Reuse the
  portfolio's _tooling_, not its design tokens or look.

**Known backend gap to carry into the UI** (GAME_FLOW.md §4.3/§7, explicit in the doc): there's no
`GET` for lobby state and no SignalR push for lobby-side changes (join/leave/ready/settings). The
lobby screen is optimistic-only for the acting client's own actions; other players' live ready
state can't be reliably synced until the backend adds that endpoint/push. Build the lobby screen
per the doc's own suggested pattern (local state + optimistic update after each POST), and surface
this as a known limitation rather than faking realtime sync that doesn't exist yet.

---

## Step 0 — Config carried over from the portfolio repo

Copy the _shape_ of these files from `/home/dat98/s/lion/dat-honguyen.github.io`, adjusted for
project name `werewolf-frontend`, no image-optimization step, no wrangler:

| File                                                       | What to copy                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Adjustments                                                                                                                                                                                                                      |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                                             | devDeps: `@angular/build`, `@angular/cli`, `@angular/compiler-cli` `^22.0.6`/`^22.0.0`, `angular-eslint` `^22.0.0`, `autoprefixer` `^10.4.21`, `eslint` `^9.39.5`, `eslint-config-prettier` `^10.1.8`, `husky` `^9.1.7`, `jsdom` `^28.0.0`, `lint-staged` `^17.0.8`, `postcss` `^8.5.6`, `prettier` `^3.8.1`, `stylelint` `^17.14.0` + `stylelint-config-prettier-scss`/`stylelint-config-standard-scss`/`stylelint-scss`, `tailwindcss` `^3.4.17`, `typescript` `~6.0.2`, `typescript-eslint` `^8.63.0`, `vitest` `^4.0.8`. deps: `@angular/common | compiler                                                                                                                                                                                                                         | core | forms | platform-browser | router` `^22.0.0`, `rxjs` `~7.8.0`, `tslib` `^2.3.0`. `lint-staged`block identical.`engines.node: "22.22.3"`. | name `"werewolf-frontend"`; drop `sharp`, `wrangler`, `prebuild`/`deploy`/`preview` scripts and `scripts/convert-images.mjs`; **add** `@microsoft/signalr` (latest `^8`) as a runtime dependency; add `@angular/router` explicitly to deps (portfolio has it as transitive via `provideRouter`? — confirm and add explicitly since this app uses routing, unlike the portfolio). |
| `angular.json`                                             | `@angular/build:application` builder, `budgets` (initial 500kB warn/1MB error, per-component style 8kB warn/16kB error), `production`/`development` configurations, `@angular/build:dev-server`, `@angular/build:unit-test` test builder.                                                                                                                                                                                                                                                                                                           | project key `werewolf-frontend`; `prefix: "app"`; add `"fileReplacements": [{ "replace": "src/environments/environment.ts", "with": "src/environments/environment.production.ts" }]` under the `production` build configuration. |
| `tsconfig.json`, `tsconfig.app.json`, `tsconfig.spec.json` | copy verbatim (strict flags, `target: ES2022`, `module: preserve`, Vitest globals in spec config).                                                                                                                                                                                                                                                                                                                                                                                                                                                  | none                                                                                                                                                                                                                             |
| `eslint.config.mjs`                                        | copy verbatim (angular-eslint recommended + template accessibility, prettier config, the same rule overrides).                                                                                                                                                                                                                                                                                                                                                                                                                                      | none                                                                                                                                                                                                                             |
| `.prettierrc`                                              | copy verbatim (`singleQuote`, `printWidth: 100`, `tabWidth: 4`, `trailingComma: none`).                                                                                                                                                                                                                                                                                                                                                                                                                                                             | none                                                                                                                                                                                                                             |
| `.prettierignore`                                          | copy verbatim.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | drop nothing needed (no `.nx` either but harmless)                                                                                                                                                                               |
| `.stylelintrc.json`                                        | copy verbatim.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | none                                                                                                                                                                                                                             |
| `.postcssrc.json`                                          | copy verbatim (`tailwindcss` + `autoprefixer` plugins).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | none                                                                                                                                                                                                                             |
| `tailwind.config.js`                                       | copy verbatim (`content: ['./src/**/*.{html,ts}']`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | none                                                                                                                                                                                                                             |
| `.editorconfig`                                            | copy verbatim.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | none                                                                                                                                                                                                                             |
| `.nvmrc`                                                   | copy verbatim (`22.22.3`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | none                                                                                                                                                                                                                             |
| `.gitignore`                                               | copy verbatim.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | drop the `# wrangler files` block (`.wrangler`, `.dev.vars*`, etc.) since no wrangler here                                                                                                                                       |
| `.husky/pre-commit`                                        | `npx lint-staged`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | none — run `npx husky init` or hand-create the same structure                                                                                                                                                                    |

---

## Step 1 — Scaffold

```
werewolf-frontend/
  angular.json
  package.json
  tsconfig.json / tsconfig.app.json / tsconfig.spec.json
  eslint.config.mjs
  .prettierrc / .prettierignore
  .stylelintrc.json
  .postcssrc.json
  tailwind.config.js
  .editorconfig
  .nvmrc
  .gitignore
  .husky/pre-commit
  public/
    favicon.ico
  src/
    main.ts
    index.html
    styles.scss
    styles/
      base/_reset.scss
      base/_typography.scss             # fantasy display serif for titles/cards + legible body font
      abstracts/_design-tokens.scss     # dark fantasy palette (moonlight/gold/blood/parchment), not portfolio's
      abstracts/_animations.scss        # shared keyframes: card-flip, card-glow-pulse, card-death, phase-iris
      abstracts/_mixins.scss            # card-frame(), parchment-texture(), glow($color)
    assets/
      fonts/                            # self-hosted fantasy display typeface
      textures/                         # parchment/moonlit-table/card-back background art
      icons/                            # faction/role icons
    environments/
      environment.ts                    # { production: false, apiBaseUrl: 'http://localhost:5000', hubUrl: 'http://localhost:5000/hubs/werewolf' }
      environment.production.ts         # { production: true, apiBaseUrl: 'https://api.werewolf.datisa.dev', hubUrl: 'https://api.werewolf.datisa.dev/hubs/werewolf' }
    app/
      app.ts / app.html / app.scss      # root shell: <router-outlet>
      app.config.ts                     # provideBrowserGlobalErrorListeners, provideRouter(routes), provideHttpClient(withFetch())
      app.routes.ts                     # '' -> HomeComponent, 'room/:roomCode' -> RoomComponent
      app.spec.ts
      core/
        models/
          role.model.ts
          lobby.model.ts
          game.model.ts
          notification.model.ts
        services/
          player-identity.service.ts
          lobby-api.service.ts
          game-api.service.ts
          rules-api.service.ts
          werewolf-hub.service.ts
          game-state.service.ts
      features/
        home/
          home.component.ts / .html / .scss
        room/
          room.component.ts / .html / .scss
          lobby-screen/
          role-reveal-screen/
          night-action-panel/
          day-discussion-screen/
          voting-screen/
          hunter-revenge-modal/
          game-over-screen/
      shared/
        components/                     # only what's actually needed (e.g. a player picker used by Cupid/Seer/Doctor/Werewolf/Witch/Hunter/Vote screens)
          player-picker/
          game-table/                    # felt/parchment table surface + PlayerCard layout shell
          animated-card/                 # generic flip/glow card primitive
          role-card/                     # role-reveal card, built on animated-card
          player-card/                   # per-player card (avatar/name/ready/alive-dead/death anim)
          phase-transition/              # cinematic full-screen phase-change overlay
        animation/
          gsap-loader.service.ts         # optional: dynamic-imports GSAP only where CSS can't express the timeline
```

---

## Step 2 — Core models (`src/app/core/models/`)

Mirror GAME_FLOW.md §8 field-for-field.

**`role.model.ts`**

```ts
export type Role =
    'Villager' | 'Werewolf' | 'Seer' | 'Doctor' | 'Hunter' | 'Witch' | 'Cupid' | 'Tanner';
export interface RoleInfo {
    role: Role;
    faction: string;
    description: string;
}
export interface RulesResponse {
    overview: string;
    phases: { phase: string; description: string }[];
    nightActionOrder: string[];
    winConditions: string[];
    settings: { name: string; default: string; description: string }[];
    roles: RoleInfo[];
}
```

**`lobby.model.ts`**

```ts
export interface GameSettings {
    revealRoleOnDeath: boolean;
    doctorCanSelfProtect: boolean;
    werewolfRequiresConsensus: boolean;
    werewolfCanTargetWerewolf: boolean;
    werewolfCanVoteNoKill: boolean;
    witchSinglePotionPerNight: boolean;
    minPlayers: number;
    allowForceStart: boolean;
}
export const DEFAULT_GAME_SETTINGS: GameSettings = {/* per §4.1 defaults */};

export interface CreateLobbyRequest {
    hostPlayerId: string;
    hostDisplayName: string;
}
export interface CreateLobbyResponse {
    roomCode: string;
}
export interface JoinLobbyRequest {
    roomCode: string;
    playerId: string;
    displayName: string;
}
export interface LeaveLobbyRequest {
    roomCode: string;
    playerId: string;
}
export interface KickPlayerRequest {
    roomCode: string;
    requestedBy: string;
    playerId: string;
}
export interface SetReadyRequest {
    roomCode: string;
    playerId: string;
    isReady: boolean;
}
export interface UpdateRoleDistributionRequest {
    roomCode: string;
    requestedBy: string;
    distribution: Partial<Record<Role, number>>;
}
export interface UpdateGameSettingsRequest {
    roomCode: string;
    requestedBy: string;
    settings: GameSettings;
}
export interface CancelLobbyRequest {
    roomCode: string;
    requestedBy: string;
}
export interface StartGameRequest {
    roomCode: string;
    requestedBy: string;
    forceStart: boolean;
}
export interface StartGameResponse {
    gameId: string;
    roomCode: string;
}

// Local-only optimistic lobby view (no GET exists server-side — see Known limitation)
export interface LocalLobbyPlayer {
    playerId: string;
    displayName: string;
    isReady: boolean;
}
export interface LocalLobbyState {
    roomCode: string;
    hostPlayerId: string;
    players: LocalLobbyPlayer[];
    roleDistribution: Partial<Record<Role, number>>;
    settings: GameSettings;
    status: 'Open' | 'Closed' | 'Cancelled';
}
```

**`game.model.ts`**

```ts
export type GamePhase =
    'RoleAssignment' | 'Night' | 'DayDiscussion' | 'DayVoting' | 'DayResolution' | 'GameOver';

export interface SubmitCupidPairingRequest {
    roomCode: string;
    playerId: string;
    firstPlayerId: string;
    secondPlayerId: string;
}
export interface SubmitWerewolfVoteRequest {
    roomCode: string;
    playerId: string;
    targetPlayerId?: string;
}
export interface SubmitDoctorProtectionRequest {
    roomCode: string;
    playerId: string;
    targetPlayerId: string;
}
export interface SubmitSeerInspectionRequest {
    roomCode: string;
    playerId: string;
    targetPlayerId: string;
}
export interface UseWitchHealPotionRequest {
    roomCode: string;
    playerId: string;
}
export interface UseWitchPoisonPotionRequest {
    roomCode: string;
    playerId: string;
    targetPlayerId: string;
}
export interface PassWitchRequest {
    roomCode: string;
    playerId: string;
}
export interface SubmitHunterRevengeShotRequest {
    roomCode: string;
    playerId: string;
    targetPlayerId: string;
}
export interface PassHunterRevengeRequest {
    roomCode: string;
    playerId: string;
}
export interface AdvanceToVotingRequest {
    roomCode: string;
    requestedBy: string;
}
export interface CastVoteRequest {
    roomCode: string;
    voterPlayerId: string;
    targetPlayerId?: string;
}
export interface CloseVotingRequest {
    roomCode: string;
    requestedBy: string;
}

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
}
export interface GameLogResponse {
    roomCode: string;
    gameId: string;
    entries: string[];
}
```

**`notification.model.ts`** — discriminated union over §7's `kind` values:

```ts
export type WerewolfNotification =
    | { kind: 'game.started'; gameId: string }
    | { kind: 'night.started'; nightNumber: number }
    | { kind: 'day.started'; dayNumber: number }
    | { kind: 'voting.started' }
    | {
          kind: 'player.died';
          playerId: string;
          cause: 'night' | 'lynch' | 'lover-link' | 'hunter-revenge';
          role?: Role;
      }
    | { kind: 'player.lynched'; playerId: string; role?: Role }
    | { kind: 'seer.result'; targetPlayerId: string; isWerewolf: boolean }
    | { kind: 'werewolf.vote'; wolfPlayerId: string; targetPlayerId: string | null }
    | { kind: 'werewolf.locked'; targetPlayerId: string | null }
    | { kind: 'vote.cast'; voterPlayerId: string; targetPlayerId: string | null }
    | { kind: 'game.ended'; winningFaction: string; roles: Record<string, Role> };
```

---

## Step 3 — Core services (`src/app/core/services/`)

- **`player-identity.service.ts`** — `providedIn: 'root'`. On construction, reads
  `localStorage['werewolf.playerId']`/`['werewolf.displayName']`; if absent, generates a
  `crypto.randomUUID()` and stores it. Exposes `playerId: Signal<string>`,
  `displayName: WritableSignal<string>` (+ `setDisplayName()` persisting to localStorage).

- **`lobby-api.service.ts`** — `HttpClient` wrapper, one method per §4.1 row, typed with the
  request/response interfaces above, all posting to `${environment.apiBaseUrl}/api/v1/lobby...`.

- **`game-api.service.ts`** — one method per §4.2 command + `getState(roomCode)` and
  `getLog(roomCode)` from §4.3, posting/getting `${environment.apiBaseUrl}/api/v1/game...`.

- **`rules-api.service.ts`** — `getRoles()` / `getRules()` (§4.3), cached in a signal after first
  fetch (static reference data, no need to refetch).

- **`werewolf-hub.service.ts`** — wraps `@microsoft/signalr`:
    - `connect(): Promise<void>` — builds `HubConnectionBuilder().withUrl(environment.hubUrl).withAutomaticReconnect().build()`, starts it.
    - `joinRoom(roomCode: string, playerId: string)` — invokes `JoinGameRoom`.
    - `leaveRoom(roomCode: string, playerId: string)` — invokes `LeaveGameRoom`.
    - `notifications$: Observable<WerewolfNotification>` — registers **one** generic handler
      (name TBD against the real hub — start with `connection.on('notification', ...)`, isolated in
      a single `private readonly notificationEventName = 'notification'` field so it's a one-line
      fix once verified) and pushes parsed payloads through a `Subject`.
    - `disconnect()` on room leave / service destroy.

- **`game-state.service.ts`** — `providedIn: 'root'`, the central store:
    - `roomCode = signal<string | null>(null)`
    - `lobby = signal<LocalLobbyState | null>(null)` (optimistic, see Known limitation)
    - `gameState = signal<GameStateResponse | null>(null)`
    - `myPlayerId` — delegates to `PlayerIdentityService`
    - `currentView = computed(...)` — maps `lobby()?.status` / `gameState()?.phase` /
      `gameState()?.pendingHunterRevenge` to one of:
      `'lobby' | 'role-reveal' | 'night' | 'day-discussion' | 'voting' | 'hunter-revenge' | 'game-over'`,
      per the state diagrams in §1/§2 (hunter-revenge takes priority whenever
      `pendingHunterRevenge.length > 0`, regardless of underlying `phase`, per §2's note that it's an
      orthogonal guard not a tracked phase).
    - `refreshGameState(roomCode)` — calls `GameApiService.getState`, updates `gameState`.
    - `startPolling()/stopPolling()` — `setInterval` (~3s) fallback while `currentView()` is an
      active-game view, calling `refreshGameState`; wired to `WerewolfHubService.notifications$` to
      also refresh immediately on any phase-relevant broadcast (`night.started`, `day.started`,
      `voting.started`, `player.died`, `player.lynched`, `game.ended`).

---

## Step 4 — Routing & screens (`src/app/app.routes.ts`, `src/app/features/`)

- **`app.routes.ts`**: `[{ path: '', component: HomeComponent }, { path: 'room/:roomCode', component: RoomComponent }]`.

- **`home/`** — form: display name input + "Create Room" button (`LobbyApiService.createLobby`
  with `PlayerIdentityService.playerId()`, then `GameStateService` seeds `lobby` optimistically and
  router navigates to `/room/:roomCode`), and a "Join Room" input+button
  (`LobbyApiService.joinLobby`, same navigation). Persist `displayName` via
  `PlayerIdentityService.setDisplayName()`.

- **`room/room.component.ts`** — on `ngOnInit`: read `roomCode` from route, set it on
  `GameStateService`, `WerewolfHubService.connect()` → `joinRoom(roomCode, myPlayerId)`,
  `GameStateService.refreshGameState(roomCode)` (safe no-op/404-tolerant before the game starts —
  guard for the "no game yet" case since Lobby has no GET), `startPolling()`. On `ngOnDestroy`:
  `stopPolling()`, `leaveRoom`, `disconnect()`. Template: `@switch (gameStateService.currentView())`
  rendering the matching child screen component, each receiving state via `input()` or reading
  `GameStateService` directly (simpler — these are tightly coupled feature screens, not reusable
  widgets, so direct injection is fine per "don't over-abstract").

- **New animated components (`shared/components/`)** — the presentation layer for the fantasy
  card-game look; purely visual/interaction wrappers around existing state and API calls, no new
  endpoints or game logic:
    - **`game-table/`** — the moonlit felt/parchment table surface that arranges `player-card`s in a
      circle/arc; the layout shell for `night-action-panel`, `day-discussion-screen`,
      `voting-screen`, and `hunter-revenge-modal` (replaces plain list layouts).
    - **`animated-card/`** — generic flip/glow card primitive (`input()` for front/back content or
      projection, `input()` for `flipped` / `glowing` / `disabled` state, using the `card-flip` /
      `card-glow-pulse` keyframes from Step 5); every other card below builds on it.
    - **`role-card/`** — built on `animated-card`; flips from card-back to role art + description on
      `role-reveal-screen`, glow color keyed to faction (Werewolf blood red, Villager silver, etc.).
    - **`player-card/`** — per-player card used in `game-table` and the lobby player list: avatar,
      name, ready-tick/alive-dead state; plays the `card-death` animation when a `player.died` /
      `player.lynched` notification names that player.
    - **`phase-transition/`** — full-screen cinematic overlay (the `phase-iris` wipe) triggered on
      `GamePhase` change (`night.started`, `day.started`, `voting.started`, `game.ended`) with a
      phase title card; auto-dismisses when the animation completes; purely presentational, driven
      by the phase/view signals already exposed by `GameStateService` in Step 3.

- **`lobby-screen/`** — §6 Lobby sketch: room code + copy-invite-link, player list rendered as
  `player-card`s with ready ticks, "Ready Up/Un-ready" (`SetReady`), host-only "Role distribution ▾"
  (`UpdateRoleDistribution` form over the 8 `Role` values), "Game settings ▾"
  (`UpdateGameSettings` form over all `GameSettings` fields, including the two werewolf toggles),
  per-row "Kick" (`KickPlayer`), "Start Game" (disabled until all ready unless `allowForceStart`,
  then "Force Start"; `StartGame`), "Cancel Lobby" (`CancelLobby`, host only). A small inline note
  that other players' ready state may lag until they refresh (documented backend gap).

- **`role-reveal-screen/`** — self-only, one-time: reads own role from
  `gameState().players.find(p => p.playerId === myPlayerId)`, pulls description from
  `RulesApiService.getRoles()`, rendered as a `role-card` that flips from card-back to role art on
  entry. "Got it" advances local `hasSeenReveal` flag (component-local signal, not server state) →
  falls through to Night Action Panel, via a `phase-transition` overlay.

- **`night-action-panel/`** — single component per plan Step 4 design note below (not split into
  five components) — laid out on `game-table`, rendering only the block(s) for the viewer's own
  role, each posting via `GameApiService` and locally disabling itself once acted (track via a
  local `signal<Set<string>>` of actions taken this night, reset on `nightNumber` change). Cupid
  block only shows when `nightNumber === 1 && lovers === null`. Live werewolf tally/lock from
  `WerewolfHubService.notifications$` filtered to `werewolf.vote`/`werewolf.locked`, reflected as a
  glow on the targeted `player-card`. Non-acting roles see a "waiting on others" state. Uses
  `shared/components/player-picker` for target selection (alive players, with role-specific
  exclusions: self always excluded from Werewolf/Seer/Doctor-self-protect-unless-setting/
  Cupid-pairing-self; last night's Doctor target grayed out).

- **`day-discussion-screen/`** — shows last death from the most recent `player.died` notification
  (or derives from `gameState` diff) via a `player-card` playing the `card-death` animation;
  host-only "Advance to Voting" (`AdvanceToVoting`).

- **`voting-screen/`** — Among Us–style emergency-meeting layout: `game-table` arranges every
  alive player's `player-card` in a ring, each tappable as the vote target (plus a dedicated "Skip
  Vote"/Abstain card), replacing a plain radio list; "Submit Vote" (`CastVote`) confirms the
  current selection. Live tally accumulated from `vote.cast` notifications in a local signal
  (keyed by voter, so a changed vote overwrites) renders as vote-count chips stacking on the
  targeted `player-card`, same read as Among Us's meeting-table tally. Host-only "Close Voting
  Early" (`CloseVoting`); when voting closes, the ejected/lynched player's `player-card` plays the
  `card-death` animation (an ejection-style pose/fade) before the screen advances.

- **`hunter-revenge-modal/`** — shown as an overlay (via `currentView() === 'hunter-revenge'`) only
  to the head of `pendingHunterRevenge`; target picker (alive players, laid out on `game-table`) +
  "Shoot" (`SubmitHunterRevengeShot`) / "Pass" (`PassHunterRevenge`); everyone else sees a "waiting
  on Hunter" banner instead of their normal screen.

- **`game-over-screen/`** — opens with a `phase-transition` win/loss reveal, then reads
  `gameState().result` (`winningFaction`, `finalRoles`) or the `game.ended` notification payload;
  lists final roles per player as flipped `role-card`s; "View full game log" fetches
  `GameApiService.getLog(roomCode)` and renders `entries`; "Return to lobby / rematch" navigates
  back to `/`.

- **`shared/components/player-picker/`** — the one genuinely reused widget (used by Cupid ×2,
  Werewolf, Doctor, Seer, Witch-poison, Hunter, Vote): `input()` for the candidate list and
  exclusion set, `output()` emitting the chosen `playerId | null`.

---

## Step 5 — Styling

Premium animated fantasy card-game look — a dark moonlit tabletop in the spirit of
Hearthstone/Inscryption, not the portfolio's theme and not a neutral dashboard:

- `styles/abstracts/_design-tokens.scss` — dark fantasy palette as CSS custom properties
  (`--color-*`), same token pattern as the portfolio but new values:
    - **Moonlight** — cool blue-silver darks for the void/table background
      (`--color-bg-void`, `--color-bg-table`, `--color-moonlight`).
    - **Gold** — primary accent for interactive elements, active-turn indicators, host controls
      (`--color-gold`, `--color-gold-glow`).
    - **Blood red** — werewolf faction, danger, death, "you're being voted" states
      (`--color-blood`, `--color-blood-glow`).
    - **Parchment** — warm off-white/cream for card faces and text-heavy panels (role descriptions,
      game log) so long-form text stays legible against the dark table
      (`--color-parchment`, `--color-parchment-ink`).
    - Per-faction glow accents for `role-card`/`player-card` (Villager silver, Werewolf blood red,
      Seer/Doctor/Witch/Cupid/Hunter each a distinct muted jewel tone, Tanner sickly yellow-green).
- `styles/abstracts/_animations.scss` — shared `@keyframes` reused across the animated components
  from Step 4:
    - `card-flip` — 3D `rotateY` reveal (`animated-card`/`role-card`).
    - `card-glow-pulse` — box-shadow pulse in the current faction/accent color (active-turn/
      selectable/vote-target state on `player-card`).
    - `card-death` — desaturate + fade + tilt (Among Us–style ejection pose for lynch/vote-out,
      reused for night deaths on `player-card`).
    - `phase-iris` — radial wipe in/out for `phase-transition`.
    - Every animation ships a `prefers-reduced-motion` fallback (instant opacity/state change, no
      motion) so the game stays playable with motion reduced.
- `styles/abstracts/_mixins.scss` — `card-frame()` (ornate border via layered `box-shadow`/
  `border-image`), `parchment-texture()` (subtle paper/noise background), `glow($color)`
  (parameterized glow used by both cards and buttons).
- `styles/base/_typography.scss` — a fantasy display serif (self-hosted in `assets/fonts/`,
  license-permitting) for headings/card titles/`phase-transition` text, paired with a plain,
  highly legible body font for descriptions, the game log, and form inputs — flourish stays on
  titles, not on anything read under time pressure (night-action timers, vote tallies).
- Tailwind utility classes for layout/spacing/responsive grid (unchanged approach); SCSS component
  files for anything token-, mixin-, or animation-driven (`animated-card`, `role-card`,
  `player-card`, `game-table`, `phase-transition`).
- Card art, table felt/parchment textures, and faction icons live in `assets/textures/` and
  `assets/icons/` — no external CDN assets, so the build stays self-contained under the existing
  budget config from Step 0.

### Optional GSAP dependency

Add `gsap` (`^3`) as an **optional** runtime dependency, used only for animation sequences the CSS
keyframes above can't express cleanly — staggered card deal-in on role assignment, the
`phase-transition` iris-wipe timeline, coordinated multi-card reflow after a death/ejection. Load
it lazily via `shared/animation/gsap-loader.service.ts` (`await import('gsap')` behind a dynamic
`import()`) so the base bundle and Step 0's budget config are unaffected on code paths that never
need it. Every GSAP-driven effect must have a pure-CSS fallback (the `_animations.scss` keyframes)
so the app still animates correctly if the dynamic import fails, is stripped, or `gsap` is never
installed.

---

## Verification

1. `npm install && npm run build` — production build succeeds within the copied budget config.
2. `npm start` (`ng serve`) — app loads at `localhost:4200`, Home screen renders, create/join
   forms work against the schema (even if backend isn't running, confirm request shape via
   network tab).
3. Manual smoke walkthrough against a running backend (`localhost:5000`) following GAME_FLOW.md
   §5's call sequence: create lobby → join from a second browser/profile → ready up → start →
   confirm Role Reveal → Night Action Panel renders only the viewer's own role controls → Day
   Discussion → Voting live tally → Game Over screen with final roles + log.
4. `npm run lint` / `npm run lint:style` / `npm run format:check` clean.
5. `npm test` — smoke specs: `App` renders, `GameStateService.currentView` computed (phase →
   screen mapping, including the hunter-revenge-overrides-phase case), `PlayerIdentityService`
   (generates once, persists across "reload" i.e. re-instantiation).
