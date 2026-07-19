# Werewolf — Frontend

An Angular client for a browser-based Werewolf (Mafia-style social deduction) party game: create or
join a room, ready up, play through night actions/day discussion/voting across multiple rounds, and
watch the game announce a winning faction — all live over HTTP + SignalR against the sibling
[`werewolf`](../werewolf) backend (WolverineFx + MartenDB, event-sourced).

See [`GAME_FLOW.md`](./GAME_FLOW.md) for the full state machine, every endpoint this client calls (and
in what order), and the SignalR notifications it subscribes to — the backend contract this app is
built against.

## Features

- **Lobby**: create/join by 6-character room code, ready-up, host controls (kick, role distribution,
  session rules), a live "who's ready" roster.
- **Room screen** (`RoomShell`): one persistent view whose content morphs with the current game phase
  instead of routing between separate screens — identity grimoire card, player grid, phase banner,
  action panel, and Town Square/Private Grimoires chat all update in place.
- **Night actions**: role-specific prompts and target pickers for Cupid, Werewolf, Doctor, Seer, and
  Witch, each gated to the acting player's own turn; a brief role-accent glow (blood-red for Werewolf,
  green for Doctor, etc.) marks whichever target they just acted on.
- **Day Discussion → Voting**: a synced countdown clock for both phases; the host's client
  auto-advances Discussion → Voting and auto-closes Voting once each countdown reaches 0:00, so a game
  never stalls waiting on a click nobody makes. Day Voting's countdown renders as a bleeding
  blood-drop/progress bar instead of Discussion's hourglass, so the two are visually distinct.
- **Majority-rule lynching**: a lynch requires the top vote-getter to have at least half the
  currently-alive players' votes (and no tie for the top spot) — a real majority, not just a
  plurality.
- **Phase transitions**: a full-screen iris-wipe overlay with a moon-phase disc (crescent → full →
  waning, cycling with the in-game night number) on every Night ⇄ Day boundary and at game start/end.
- **Horror-themed backdrop**: an inlined CC0 haunted-house/graveyard silhouette behind the room screen
  at all times, with a howling-wolf silhouette that fades in only during Night.
- **Sequenced death reveal**: a player's card plays a brief "dying" animation before settling into its
  static dead state, instead of cutting straight to it.
- **i18n**: English + Vietnamese, switchable live (`@ngx-translate`); fonts chosen to carry Vietnamese
  diacritics correctly.
- **`prefers-reduced-motion` support**: every animation added above (dying, phase transition, iris-wipe)
  is disabled under the OS/browser's reduced-motion setting.

## Requirements

- Node `22.22.3` (see `.nvmrc`/`engines` in `package.json`)
- The [`werewolf`](../werewolf) backend running locally (see its own README) — checked out as a sibling
  directory to this repo; `e2e/start-backend.cjs` locates it via that assumption.

## Develop

```bash
npm install
npm start          # ng serve, proxies to the backend per src/environments/environment.ts
```

## Test

```bash
npm test           # Jasmine/Karma unit tests
npm run e2e        # Playwright end-to-end suite (starts the backend + a dedicated FE dev server automatically)
npm run e2e:ui      # same, with Playwright's UI runner
```

The e2e suite drives real multi-browser-context games (several simulated players at once) through
full playthroughs — lobby → night actions → day discussion/voting → game over — recording
screenshots/video under `e2e/screenshots/`/`e2e/videos/` per run.

## Lint & format

```bash
npm run lint         # eslint
npm run lint:style   # stylelint (SCSS)
npm run format       # prettier --write
```

A pre-commit hook (Husky + lint-staged) runs eslint/stylelint/prettier on staged files automatically.

## Build & deploy

```bash
npm run build -- --configuration production
```

Publishing a GitHub Release triggers `.github/workflows/deploy.yml`: production build → sync to S3 →
purge the Cloudflare cache. The release's tag name becomes the app's displayed version
(`settings.version` in the UI).

## License

[Polyform Noncommercial 1.0.0](./LICENSE) — free for noncommercial use; see the license file for the
full terms.
