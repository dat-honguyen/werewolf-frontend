# Unified Room Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the Room feature's 7 phase-switched screens (`lobby-screen`, `role-reveal-screen`, `night-action-panel`, `day-discussion-screen`, `voting-screen`, `hunter-revenge-modal`, `game-over-screen`) into one persistent `RoomShell` layout — matching `werewolf_game_interface (2).html`'s 3-column LUNARIS design (Identity Grimoire card, phase banner, player grid, chat) — so the app has exactly 2 screens: Home and Room.

**Architecture:** `RoomShell` (renamed/rewritten from the current `game-shell`) becomes the sole always-mounted view for an active room. It owns all phase-driven state and API calls (absorbing the logic currently spread across the 7 retired components) and composes four new presentational sub-components: `IdentityGrimoireCard`, `PhaseBanner`, `PlayerGrid`, `RoomActionPanel`. `RoomComponent` stops `@switch`-ing between screens and always renders `<app-room-shell>`.

**Tech Stack:** Angular (standalone components, signals, `@if`/`@switch`/`@for`), RxJS, plain SCSS (BEM-ish, one file per component) — matches existing project conventions, no Tailwind.

## Global Constraints

- No sound/ambience — no Tone.js, nothing audio-related.
- No new unit tests are added by this plan — none of the 7 retired components have `.spec.ts` files today (confirmed: `find src/app/features/room -name "*.spec.ts"` returns nothing), so this plan follows the existing convention of manual/Playwright verification for template-heavy UI, not TDD.
- Frontend repo root: `C:\Users\CCDT\source\werewolf-frontend`. Dev server: `npm start` (serves `https://localhost:4200`). Build check: `npx ng build --configuration development`.
- Match the mockup's visual language (colors, spacing, card shapes) via plain SCSS — not a literal Tailwind class port. Mockup file: `werewolf_game_interface (2).html` (repo root).
- Angular components use `input()`/`output()`/`signal()`/`computed()` and `@if`/`@switch`/`@for` — no `*ngIf`/`@Input()` decorators.
- `role-card`/`animated-card` (`src/app/shared/components/role-card/`, `.../animated-card/`) are **kept** — they're reused by `PlayerGrid`'s game-over reveal mode. Do not delete them.
- Every new/modified TypeScript file must type-check cleanly: run `npx ng build --configuration development` after each task and confirm `Build succeeded.` with no new errors.

---

### Task 1: `IdentityGrimoireCard` component

**Files:**

- Create: `src/app/shared/components/identity-grimoire-card/identity-grimoire-card.ts`
- Create: `src/app/shared/components/identity-grimoire-card/identity-grimoire-card.html`
- Create: `src/app/shared/components/identity-grimoire-card/identity-grimoire-card.scss`

**Interfaces:**

- Consumes: `Role` (`src/app/core/models/role.model.ts`), `ROLE_ICON` (`src/app/core/utils/role-icon.util.ts`), `GameStateService.hasSeenRoleReveal` (`src/app/core/services/game-state.service.ts:35`).
- Produces: `<app-identity-grimoire-card [role] [description]>` — a self-contained flip card. No outputs; it writes `GameStateService.hasSeenRoleReveal` itself on first flip. Consumed by Task 5 (`RoomShell`).

- [ ] **Step 1: Write the component class**

```typescript
// src/app/shared/components/identity-grimoire-card/identity-grimoire-card.ts
import { Component, inject, input, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { GameStateService } from '../../../core/services/game-state.service';
import { Role } from '../../../core/models/role.model';
import { ROLE_ICON } from '../../../core/utils/role-icon.util';

/**
 * The mockup's "Identity Grimoire" flip card (werewolf_game_interface (2).html's #role-card).
 * Before a role is assigned (lobby), shows a mystery placeholder face only, not flippable.
 * Once `role()` is set, it's flippable; the first flip marks GameStateService.hasSeenRoleReveal so
 * a page refresh mid-game reopens already-flipped instead of replaying the reveal.
 */
@Component({
    selector: 'app-identity-grimoire-card',
    imports: [],
    templateUrl: './identity-grimoire-card.html',
    styleUrl: './identity-grimoire-card.scss'
})
export class IdentityGrimoireCard {
    private readonly sanitizer = inject(DomSanitizer);
    private readonly gameState = inject(GameStateService);

    readonly role = input<Role | null>(null);
    readonly description = input('');

    readonly flipped = signal(this.gameState.hasSeenRoleReveal());

    readonly icon = () =>
        this.role() ? this.sanitizer.bypassSecurityTrustHtml(ROLE_ICON[this.role()!]) : null;

    toggleFlip(): void {
        if (!this.role()) {
            return;
        }
        this.flipped.update((v) => !v);
        if (this.flipped()) {
            this.gameState.hasSeenRoleReveal.set(true);
        }
    }
}
```

- [ ] **Step 2: Write the template**

```html
<!-- src/app/shared/components/identity-grimoire-card/identity-grimoire-card.html -->
<div class="identity-grimoire">
    <h3 class="identity-grimoire__title">Identity Grimoire</h3>

    <div
        class="identity-grimoire__card"
        [class.identity-grimoire__card--flipped]="flipped()"
        [class.identity-grimoire__card--inert]="!role()"
        (click)="toggleFlip()"
    >
        <div class="identity-grimoire__card-inner">
            <div class="identity-grimoire__face identity-grimoire__face--front">
                <span class="identity-grimoire__eyebrow">LUNARIS</span>
                <div class="identity-grimoire__glyph">✨</div>
                <span class="identity-grimoire__hint">
                    {{ role() ? 'Tap card to inspect' : 'Awaiting the game to start' }}
                </span>
            </div>

            <div class="identity-grimoire__face identity-grimoire__face--back">
                <span class="identity-grimoire__eyebrow">Your Role</span>
                @if (icon(); as icon) {
                <div class="identity-grimoire__role-icon" [innerHTML]="icon"></div>
                }
                <div class="identity-grimoire__role-text">
                    <h4>{{ role() }}</h4>
                    <p>{{ description() }}</p>
                </div>
            </div>
        </div>
    </div>
</div>
```

- [ ] **Step 3: Write the stylesheet**

```scss
// src/app/shared/components/identity-grimoire-card/identity-grimoire-card.scss
.identity-grimoire {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    align-items: center;

    &__title {
        align-self: flex-start;
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--text-muted);
        font-weight: 700;
        margin: 0;
    }

    &__card {
        width: 100%;
        max-width: 170px;
        height: 240px;
        perspective: 1200px;
        cursor: pointer;

        &--inert {
            cursor: default;
        }
    }

    &__card-inner {
        position: relative;
        width: 100%;
        height: 100%;
        transition: transform 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        transform-style: preserve-3d;

        .identity-grimoire__card--flipped & {
            transform: rotateY(180deg);
        }
    }

    &__face {
        position: absolute;
        inset: 0;
        backface-visibility: hidden;
        border-radius: 1rem;
        border: 1px solid var(--border);
        padding: 1rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
        text-align: center;

        &--front {
            background: linear-gradient(180deg, #1c1830 0%, #101218 60%, var(--bg-main) 100%);
            border-color: color-mix(in srgb, var(--primary) 30%, transparent);
        }

        &--back {
            transform: rotateY(180deg);
            background: linear-gradient(180deg, #120f24 0%, #181a24 55%, var(--bg-main) 100%);
            border-color: var(--primary);
        }
    }

    &__eyebrow {
        font-size: 0.62rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.15em;
        color: var(--primary);
    }

    &__glyph {
        width: 3.5rem;
        height: 3.5rem;
        border-radius: 999px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.6rem;
        background: color-mix(in srgb, var(--primary) 15%, transparent);
        box-shadow: 0 0 15px color-mix(in srgb, var(--primary) 25%, transparent);
    }

    &__hint {
        font-size: 0.62rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--primary);
        opacity: 0.8;
    }

    &__role-icon {
        width: 2.75rem;
        height: 2.75rem;
        color: var(--primary);
    }

    &__role-text {
        h4 {
            margin: 0 0 0.35rem;
            font-size: 1rem;
            font-weight: 700;
            color: var(--primary);
        }

        p {
            margin: 0;
            font-size: 0.7rem;
            color: var(--text-muted);
            line-height: 1.4;
        }
    }
}
```

- [ ] **Step 4: Verify it builds**

Run: `npx ng build --configuration development`
Expected: `Build succeeded.` (this component isn't used anywhere yet, so a clean build just confirms no syntax/type errors).

- [ ] **Step 5: Commit**

```bash
git add src/app/shared/components/identity-grimoire-card/
git commit -m "Add IdentityGrimoireCard component for the unified room screen"
```

---

### Task 2: `PhaseBanner` component

**Files:**

- Create: `src/app/shared/components/phase-banner/phase-banner.ts`
- Create: `src/app/shared/components/phase-banner/phase-banner.html`
- Create: `src/app/shared/components/phase-banner/phase-banner.scss`

**Interfaces:**

- Produces: `<app-phase-banner [icon] [status] [instruction] [countdown] [countdownLabel]>` — purely presentational. Consumed by Task 5 (`RoomShell`).

- [ ] **Step 1: Write the component class**

```typescript
// src/app/shared/components/phase-banner/phase-banner.ts
import { Component, input } from '@angular/core';

/** The mockup's status banner + countdown clock (werewolf_game_interface (2).html's #phase-banner). */
@Component({
    selector: 'app-phase-banner',
    imports: [],
    templateUrl: './phase-banner.html',
    styleUrl: './phase-banner.scss'
})
export class PhaseBanner {
    readonly icon = input.required<string>();
    readonly status = input.required<string>();
    readonly instruction = input.required<string>();
    readonly countdown = input<string | null>(null);
    readonly countdownLabel = input('Time left');
    readonly countdownExpired = input(false);
}
```

- [ ] **Step 2: Write the template**

```html
<!-- src/app/shared/components/phase-banner/phase-banner.html -->
<div class="phase-banner">
    <div class="phase-banner__main">
        <div class="phase-banner__icon">{{ icon() }}</div>
        <div>
            <div class="phase-banner__status">{{ status() }}</div>
            <h2 class="phase-banner__instruction">{{ instruction() }}</h2>
        </div>
    </div>

    @if (countdown(); as countdown) {
    <div
        class="phase-banner__countdown"
        [class.phase-banner__countdown--expired]="countdownExpired()"
    >
        <span class="phase-banner__countdown-label">{{ countdownLabel() }}</span>
        <span class="phase-banner__countdown-clock">{{ countdown }}</span>
    </div>
    }
</div>
```

- [ ] **Step 3: Write the stylesheet**

```scss
// src/app/shared/components/phase-banner/phase-banner.scss
.phase-banner {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 1rem;
    padding: 1.1rem 1.25rem;
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;

    &__main {
        display: flex;
        align-items: center;
        gap: 1rem;
    }

    &__icon {
        width: 3rem;
        height: 3rem;
        border-radius: 0.75rem;
        border: 1px solid color-mix(in srgb, var(--primary) 20%, transparent);
        background: color-mix(in srgb, var(--primary) 10%, transparent);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.4rem;
    }

    &__status {
        font-size: 0.65rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--primary);
    }

    &__instruction {
        margin: 0.15rem 0 0;
        font-size: 1rem;
        font-weight: 700;
        color: var(--text-main);
    }

    &__countdown {
        display: flex;
        align-items: center;
        gap: 0.65rem;
        background: var(--bg-main);
        border: 1px solid var(--border);
        border-radius: 0.75rem;
        padding: 0.5rem 0.9rem;

        &--expired &-clock {
            color: var(--danger);
        }
    }

    &__countdown-label {
        font-size: 0.6rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-muted);
        font-family: monospace;
    }

    &__countdown-clock {
        font-size: 1.05rem;
        font-weight: 700;
        font-family: monospace;
        color: var(--primary);
    }
}
```

- [ ] **Step 4: Verify it builds**

Run: `npx ng build --configuration development`
Expected: `Build succeeded.`

- [ ] **Step 5: Commit**

```bash
git add src/app/shared/components/phase-banner/
git commit -m "Add PhaseBanner component for the unified room screen"
```

---

### Task 3: `PlayerGrid` component

**Files:**

- Create: `src/app/shared/components/player-grid/player-grid.ts`
- Create: `src/app/shared/components/player-grid/player-grid.html`
- Create: `src/app/shared/components/player-grid/player-grid.scss`

**Interfaces:**

- Consumes: `Role` (`role.model.ts`), `Avatar` (`src/app/shared/components/avatar/avatar.ts`), `RoleCard` (`src/app/shared/components/role-card/role-card.ts`).
- Produces: `PlayerGridEntry` interface and `<app-player-grid [entries] (action)>`. `action` emits the `playerId` whose action button was clicked. Consumed by Task 5 (`RoomShell`).

- [ ] **Step 1: Write the component class**

```typescript
// src/app/shared/components/player-grid/player-grid.ts
import { Component, input, output } from '@angular/core';
import { Avatar } from '../avatar/avatar';
import { RoleCard } from '../role-card/role-card';
import { Role } from '../../../core/models/role.model';

/**
 * One entry per row in the mockup's player grid (werewolf_game_interface (2).html's #player-grid).
 * `actionLabel` undefined means no action button renders for that card (e.g. a dead player, or a
 * player who isn't a valid target this turn). `revealedRole` is only set in game-over mode, and
 * takes over the card's content instead of an action button.
 */
export interface PlayerGridEntry {
    playerId: string;
    displayName: string;
    isAlive: boolean;
    isMe: boolean;
    isHost: boolean;
    isReady?: boolean;
    voteCount?: number;
    selected?: boolean;
    actionLabel?: string;
    actionVariant?: 'default' | 'danger' | 'accent';
    actionDisabled?: boolean;
    revealedRole?: Role;
}

@Component({
    selector: 'app-player-grid',
    imports: [Avatar, RoleCard],
    templateUrl: './player-grid.html',
    styleUrl: './player-grid.scss'
})
export class PlayerGrid {
    readonly entries = input.required<PlayerGridEntry[]>();

    readonly action = output<string>();
}
```

- [ ] **Step 2: Write the template**

```html
<!-- src/app/shared/components/player-grid/player-grid.html -->
<div class="player-grid">
    @for (entry of entries(); track entry.playerId) {
    <div
        class="player-grid__card"
        [class.player-grid__card--dead]="!entry.isAlive"
        [class.player-grid__card--selected]="entry.selected"
    >
        <div class="player-grid__identity">
            <div class="player-grid__avatar-wrap">
                <app-avatar [seed]="entry.displayName" [size]="48"></app-avatar>
                <span
                    class="player-grid__status-dot"
                    [class.player-grid__status-dot--dead]="!entry.isAlive"
                ></span>
            </div>
            <div>
                <div class="player-grid__name">
                    {{ entry.displayName }} @if (entry.isMe) {
                    <span class="player-grid__tag">YOU</span>
                    } @if (entry.isHost) {
                    <span class="player-grid__tag player-grid__tag--host">HOST</span>
                    }
                </div>
                <div class="player-grid__meta">
                    <span>{{ entry.isAlive ? 'Active' : 'Deceased' }}</span>
                    @if (entry.isReady !== undefined) {
                    <span [class.player-grid__ready--yes]="entry.isReady"
                        >{{ entry.isReady ? '• Ready' : '• Not ready' }}</span
                    >
                    } @if (entry.voteCount) {
                    <span class="player-grid__votes">• {{ entry.voteCount }} votes</span>
                    }
                </div>
            </div>
        </div>

        @if (entry.revealedRole; as role) {
        <div class="player-grid__reveal">
            <app-role-card [role]="role" [revealed]="true"></app-role-card>
        </div>
        } @else if (entry.actionLabel) {
        <button
            type="button"
            class="player-grid__action"
            [class.player-grid__action--danger]="entry.actionVariant === 'danger'"
            [class.player-grid__action--accent]="entry.actionVariant === 'accent'"
            [disabled]="entry.actionDisabled"
            (click)="action.emit(entry.playerId)"
        >
            {{ entry.actionLabel }}
        </button>
        }
    </div>
    }
</div>
```

- [ ] **Step 3: Write the stylesheet**

```scss
// src/app/shared/components/player-grid/player-grid.scss
.player-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;

    @media (max-width: 640px) {
        grid-template-columns: 1fr;
    }

    &__card {
        border: 1px solid var(--border);
        border-radius: 1rem;
        padding: 0.9rem 1rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        background: color-mix(in srgb, var(--bg-surface) 60%, transparent);
        transition: border-color 0.2s ease;

        &--selected {
            border-color: var(--primary);
            background: color-mix(in srgb, var(--primary) 8%, transparent);
        }

        &--dead {
            opacity: 0.45;
            background: color-mix(in srgb, var(--bg-main) 30%, transparent);
        }
    }

    &__identity {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        min-width: 0;
    }

    &__avatar-wrap {
        position: relative;
        flex-shrink: 0;
    }

    &__status-dot {
        position: absolute;
        bottom: -2px;
        right: -2px;
        width: 0.85rem;
        height: 0.85rem;
        border-radius: 999px;
        background: var(--success);
        border: 2px solid var(--bg-surface);

        &--dead {
            background: var(--danger);
        }
    }

    &__name {
        font-weight: 700;
        font-size: 0.9rem;
        display: flex;
        align-items: center;
        gap: 0.4rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;

        .player-grid__card--dead & {
            text-decoration: line-through;
            color: var(--text-muted);
        }
    }

    &__tag {
        font-size: 0.55rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        padding: 0.05rem 0.35rem;
        border-radius: 0.25rem;
        background: color-mix(in srgb, var(--primary) 15%, transparent);
        color: var(--primary);

        &--host {
            background: color-mix(in srgb, var(--accent-night, var(--primary)) 15%, transparent);
        }
    }

    &__meta {
        font-size: 0.65rem;
        color: var(--text-muted);
        display: flex;
        gap: 0.4rem;
        margin-top: 0.15rem;
    }

    &__ready--yes {
        color: var(--success);
    }

    &__votes {
        color: var(--primary);
        font-weight: 700;
    }

    &__action {
        flex-shrink: 0;
        font-size: 0.65rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        padding: 0.4rem 0.85rem;
        border-radius: 999px;
        border: 1px solid var(--primary);
        background: color-mix(in srgb, var(--primary) 15%, transparent);
        color: var(--primary);
        cursor: pointer;

        &:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }

        &--danger {
            border-color: var(--danger);
            background: color-mix(in srgb, var(--danger) 15%, transparent);
            color: var(--danger);
        }

        &--accent {
            border: none;
            color: white;
            background: linear-gradient(135deg, var(--accent-day, var(--primary)), var(--danger));
        }
    }

    &__reveal {
        flex-shrink: 0;
        width: 64px;
    }
}
```

- [ ] **Step 4: Verify it builds**

Run: `npx ng build --configuration development`
Expected: `Build succeeded.`

- [ ] **Step 5: Commit**

```bash
git add src/app/shared/components/player-grid/
git commit -m "Add PlayerGrid component for the unified room screen"
```

---

### Task 4: `RoomActionPanel` component

**Files:**

- Create: `src/app/shared/components/room-action-panel/room-action-panel.ts`
- Create: `src/app/shared/components/room-action-panel/room-action-panel.html`
- Create: `src/app/shared/components/room-action-panel/room-action-panel.scss`

**Interfaces:**

- Produces: `<app-room-action-panel>` with the inputs/outputs below — a "kitchen sink" of auxiliary controls that aren't a per-opponent grid action (self-only or informational). Every input defaults to a falsy/null value so `RoomShell` only sets the ones relevant to the current phase. Consumed by Task 5 (`RoomShell`).

- [ ] **Step 1: Write the component class**

```typescript
// src/app/shared/components/room-action-panel/room-action-panel.ts
import { Component, input, output } from '@angular/core';

/**
 * Auxiliary phase controls that don't belong on a specific opponent's PlayerGrid card: self-only
 * actions (ready toggle, witch heal, passes) and informational text (seer/werewolf-tally results,
 * vote tally, game log). Every section is independently toggled by its `show*`/non-null input, so
 * RoomShell only lights up what's relevant to the current phase.
 */
@Component({
    selector: 'app-room-action-panel',
    imports: [],
    templateUrl: './room-action-panel.html',
    styleUrl: './room-action-panel.scss'
})
export class RoomActionPanel {
    // Lobby
    readonly showReadyToggle = input(false);
    readonly isReady = input(false);
    readonly readyToggle = output<void>();
    readonly showCancelLobby = input(false);
    readonly cancelLobby = output<void>();
    readonly showLeaveLobby = input(false);
    readonly leaveLobby = output<void>();

    // Night: werewolf
    readonly werewolfTally = input<{ voterName: string; targetName: string }[] | null>(null);
    readonly werewolfLockedLabel = input<string | null>(null);
    readonly showWerewolfPass = input(false);
    readonly werewolfPass = output<void>();

    // Night: seer
    readonly seerResult = input<string | null>(null);

    // Night: witch
    readonly witchTargetInfo = input<string | null>(null);
    readonly showWitchHeal = input(false);
    readonly witchHeal = output<void>();
    readonly showWitchPass = input(false);
    readonly witchPassLabel = input('Pass');
    readonly witchPass = output<void>();

    // Night: cupid
    readonly cupidHint = input<string | null>(null);

    // Night: waiting fallback
    readonly waitingText = input<string | null>(null);

    // Voting
    readonly showSubmitVote = input(false);
    readonly submitVote = output<void>();
    readonly voteTally = input<string | null>(null);

    // Hunter revenge
    readonly showHunterPass = input(false);
    readonly hunterPass = output<void>();

    // Game over
    readonly showViewLog = input(false);
    readonly viewLog = output<void>();
    readonly logEntries = input<string[] | null>(null);
    readonly showLeaveRoom = input(false);
    readonly leaveRoom = output<void>();
}
```

- [ ] **Step 2: Write the template**

```html
<!-- src/app/shared/components/room-action-panel/room-action-panel.html -->
<div class="room-action-panel">
    @if (showReadyToggle()) {
    <button
        type="button"
        class="room-action-panel__button room-action-panel__button--primary"
        (click)="readyToggle.emit()"
    >
        {{ isReady() ? 'Un-ready' : 'Ready Up' }}
    </button>
    } @if (showCancelLobby()) {
    <button
        type="button"
        class="room-action-panel__button room-action-panel__button--danger"
        (click)="cancelLobby.emit()"
    >
        Cancel Lobby
    </button>
    } @if (showLeaveLobby()) {
    <button
        type="button"
        class="room-action-panel__button room-action-panel__button--danger"
        (click)="leaveLobby.emit()"
    >
        Leave Lobby
    </button>
    } @if (werewolfTally(); as tally) {
    <div class="room-action-panel__info">
        @for (entry of tally; track entry.voterName) {
        <span>{{ entry.voterName }} → {{ entry.targetName }}</span>
        } @if (werewolfLockedLabel(); as locked) {
        <strong>Locked: {{ locked }}</strong>
        }
    </div>
    } @if (showWerewolfPass()) {
    <button type="button" class="room-action-panel__button" (click)="werewolfPass.emit()">
        Pass (no kill)
    </button>
    } @if (seerResult(); as result) {
    <p class="room-action-panel__result">{{ result }}</p>
    } @if (witchTargetInfo(); as info) {
    <p class="room-action-panel__result">{{ info }}</p>
    } @if (showWitchHeal()) {
    <button
        type="button"
        class="room-action-panel__button room-action-panel__button--accent"
        (click)="witchHeal.emit()"
    >
        Heal target
    </button>
    } @if (showWitchPass()) {
    <button type="button" class="room-action-panel__button" (click)="witchPass.emit()">
        {{ witchPassLabel() }}
    </button>
    } @if (cupidHint(); as hint) {
    <p class="room-action-panel__result">{{ hint }}</p>
    } @if (waitingText(); as waiting) {
    <p class="room-action-panel__waiting">{{ waiting }}</p>
    } @if (showSubmitVote()) {
    <button
        type="button"
        class="room-action-panel__button room-action-panel__button--primary"
        (click)="submitVote.emit()"
    >
        Submit Vote
    </button>
    } @if (voteTally(); as tally) {
    <p class="room-action-panel__result">{{ tally }}</p>
    } @if (showHunterPass()) {
    <button type="button" class="room-action-panel__button" (click)="hunterPass.emit()">
        Pass
    </button>
    } @if (showViewLog()) {
    <button type="button" class="room-action-panel__button" (click)="viewLog.emit()">
        View full game log
    </button>
    } @if (logEntries(); as entries) {
    <ul class="room-action-panel__log">
        @for (entry of entries; track $index) {
        <li>{{ entry }}</li>
        }
    </ul>
    } @if (showLeaveRoom()) {
    <button type="button" class="room-action-panel__button" (click)="leaveRoom.emit()">
        Leave room
    </button>
    }
</div>
```

- [ ] **Step 3: Write the stylesheet**

```scss
// src/app/shared/components/room-action-panel/room-action-panel.scss
.room-action-panel {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem;

    &:empty {
        display: none;
    }

    &__button {
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.02em;
        padding: 0.55rem 1.1rem;
        border-radius: 0.75rem;
        border: 1px solid var(--border);
        background: var(--bg-nested);
        color: var(--text-main);
        cursor: pointer;

        &--primary {
            border: none;
            color: white;
            background: linear-gradient(135deg, var(--accent-day, var(--primary)), var(--danger));
        }

        &--danger {
            border-color: var(--danger);
            color: var(--danger);
            background: color-mix(in srgb, var(--danger) 10%, transparent);
        }

        &--accent {
            border-color: var(--success);
            color: var(--success);
            background: color-mix(in srgb, var(--success) 10%, transparent);
        }
    }

    &__info {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        font-size: 0.75rem;
        color: var(--text-muted);
    }

    &__result {
        font-size: 0.8rem;
        color: var(--text-main);
        margin: 0;
    }

    &__waiting {
        font-size: 0.85rem;
        font-style: italic;
        color: var(--text-muted);
        margin: 0;
    }

    &__log {
        list-style: none;
        margin: 0;
        padding: 0.75rem;
        border: 1px solid var(--border);
        border-radius: 0.75rem;
        background: var(--bg-main);
        font-size: 0.75rem;
        max-height: 200px;
        overflow-y: auto;
        width: 100%;

        li {
            padding: 0.2rem 0;
        }
    }
}
```

- [ ] **Step 4: Verify it builds**

Run: `npx ng build --configuration development`
Expected: `Build succeeded.`

- [ ] **Step 5: Commit**

```bash
git add src/app/shared/components/room-action-panel/
git commit -m "Add RoomActionPanel component for the unified room screen"
```

---

### Task 5: Rewrite `game-shell` into `room-shell`

**Files:**

- Create: `src/app/shared/components/room-shell/room-shell.ts`
- Create: `src/app/shared/components/room-shell/room-shell.html`
- Create: `src/app/shared/components/room-shell/room-shell.scss`
- Delete (end of task, once Task 6 repoints all references): `src/app/shared/components/game-shell/game-shell.ts`, `.../game-shell.html`, `.../game-shell.scss`

**Interfaces:**

- Consumes: `GameStateService`, `GameApiService`, `LobbyApiService`, `PlayerIdentityService`, `ToastService`, `WerewolfHubService`, `RulesApiService` (all `src/app/core/services/`), `IdentityGrimoireCard`, `PhaseBanner`, `PlayerGrid` + `PlayerGridEntry`, `RoomActionPanel` (Tasks 1-4), `SettingsModal` (`src/app/features/room/lobby-screen/settings-modal/settings-modal.ts`), `DEFAULT_GAME_SETTINGS` (`src/app/core/models/lobby.model.ts`).
- Produces: `<app-room-shell>` — the sole always-mounted room view. Consumed by Task 6 (`RoomComponent`).

- [ ] **Step 1: Write the component class**

```typescript
// src/app/shared/components/room-shell/room-shell.ts
import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval, switchMap } from 'rxjs';
import { GameApiService } from '../../../core/services/game-api.service';
import { GameStateService } from '../../../core/services/game-state.service';
import { LobbyApiService } from '../../../core/services/lobby-api.service';
import { PlayerIdentityService } from '../../../core/services/player-identity.service';
import { RulesApiService } from '../../../core/services/rules-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { WerewolfHubService } from '../../../core/services/werewolf-hub.service';
import { extractErrorMessage } from '../../../core/utils/http-error.util';
import { DEFAULT_GAME_SETTINGS, LocalLobbyPlayer } from '../../../core/models/lobby.model';
import { Role } from '../../../core/models/role.model';
import { Avatar } from '../avatar/avatar';
import { IdentityGrimoireCard } from '../identity-grimoire-card/identity-grimoire-card';
import { PhaseBanner } from '../phase-banner/phase-banner';
import { PlayerGrid, PlayerGridEntry } from '../player-grid/player-grid';
import { RoomActionPanel } from '../room-action-panel/room-action-panel';
import { SettingsModal } from '../../../features/room/lobby-screen/settings-modal/settings-modal';

interface ChatMessage {
    senderId: string;
    senderName: string;
    text: string;
    sentAtUtc: string;
}

type ChatTab = 'town' | 'pack';
type NightAction = 'cupid' | 'seer' | 'werewolf' | 'doctor' | 'witch';

const WOLF_VOTE_POLL_MS = 2000;

const ROLE_OBJECTIVE: Record<Role, string> = {
    Villager: 'Find and eliminate every werewolf.',
    Werewolf: 'Eliminate all villagers.',
    Seer: 'Find and eliminate every werewolf.',
    Doctor: 'Find and eliminate every werewolf.',
    Hunter: 'Find and eliminate every werewolf.',
    Witch: 'Find and eliminate every werewolf.',
    Cupid: 'Find and eliminate every werewolf.',
    Tanner: 'Get yourself lynched by the village.'
};

/**
 * The single persistent Room view (LUNARIS layout): header, Identity Grimoire + stats on the left,
 * phase banner + player grid + action panel in the middle, chat on the right. Absorbs the logic
 * that used to live in lobby-screen, role-reveal-screen, night-action-panel, day-discussion-screen,
 * voting-screen, hunter-revenge-modal, and game-over-screen -- those are retired as standalone
 * screens (see docs/superpowers/plans/2026-07-17-unified-room-screen.md) in favor of this always-
 * mounted shell whose *contents* change with GameStateService.currentView(), not the screen itself.
 */
@Component({
    selector: 'app-room-shell',
    imports: [
        Avatar,
        IdentityGrimoireCard,
        PhaseBanner,
        PlayerGrid,
        RoomActionPanel,
        SettingsModal
    ],
    templateUrl: './room-shell.html',
    styleUrl: './room-shell.scss'
})
export class RoomShell {
    private readonly gameApi = inject(GameApiService);
    private readonly gameState = inject(GameStateService);
    private readonly lobbyApi = inject(LobbyApiService);
    private readonly playerIdentity = inject(PlayerIdentityService);
    private readonly rulesApi = inject(RulesApiService);
    private readonly toast = inject(ToastService);
    private readonly hub = inject(WerewolfHubService);
    private readonly router = inject(Router);

    readonly roomCode = this.gameState.roomCode;
    readonly view = this.gameState.currentView;
    readonly lobby = this.gameState.lobby;
    readonly state = this.gameState.gameState;
    readonly myPlayerId = this.playerIdentity.playerId;

    readonly showSettings = signal(false);
    readonly chatTab = signal<ChatTab>('town');
    readonly townMessages = signal<ChatMessage[]>([]);
    readonly draftMessage = signal('');

    readonly roleDescription = signal('');
    readonly lastDeathText = signal<string | null>(null);
    readonly nowMs = signal(Date.now());
    readonly logEntries = signal<string[] | null>(null);

    // Night-phase local state (mirrors former NightActionPanel)
    private readonly actionsTaken = signal<Set<NightAction>>(new Set());
    private readonly lastDoctorTarget = signal<string | null>(null);
    private readonly cupidFirstPick = signal<string | null>(null);
    readonly wolfVotes = signal<Map<string, string | null>>(new Map());
    readonly wolfLockedTarget = signal<string | null | undefined>(undefined);
    readonly seerResult = signal<{ targetPlayerId: string; isWerewolf: boolean } | null>(null);
    readonly witchTarget = signal<string | null | undefined>(undefined);
    readonly witchHealUsed = signal(false);
    readonly witchPoisonUsed = signal(false);

    // Voting-phase local state (mirrors former VotingScreen)
    readonly selectedVoteTarget = signal<string | null | undefined>(undefined);
    private readonly votesByVoter = signal<Map<string, string | null>>(new Map());

    readonly isHost = computed(() => this.lobby()?.hostPlayerId === this.myPlayerId());
    readonly myPlayer = computed<LocalLobbyPlayer | undefined>(() =>
        this.lobby()?.players.find((p) => p.playerId === this.myPlayerId())
    );
    readonly settings = computed(() => this.lobby()?.settings ?? DEFAULT_GAME_SETTINGS);

    readonly myRole = computed<Role | null>(
        () => this.state()?.players.find((p) => p.playerId === this.myPlayerId())?.role ?? null
    );
    readonly ownObjective = computed(() => {
        const role = this.myRole();
        return role ? ROLE_OBJECTIVE[role] : '';
    });

    readonly isNight = computed(() => this.state()?.phase === 'Night');
    readonly aliveCount = computed(
        () => (this.state()?.players ?? []).filter((p) => p.isAlive).length
    );
    readonly deadCount = computed(() => (this.state()?.players ?? []).length - this.aliveCount());

    readonly canSeePackChat = computed(
        () => this.myRole() === 'Werewolf' && this.myPlayer() !== undefined
    );

    readonly canStartGame = computed(() => {
        const lobby = this.lobby();
        if (!lobby) {
            return false;
        }
        const allReady = lobby.players.every((p) => p.isReady);
        if (lobby.players.length < lobby.settings.minPlayers) {
            return false;
        }
        return allReady || lobby.settings.allowForceStart;
    });
    readonly needsForceStart = computed(
        () =>
            !(this.lobby()?.players.every((p) => p.isReady) ?? true) &&
            (this.lobby()?.settings.allowForceStart ?? false)
    );

    readonly myTurnRole = computed(() => {
        const role = this.state()?.currentNightRole ?? null;
        return role !== null && role === this.myRole() ? role : null;
    });
    readonly showCupid = computed(
        () =>
            this.myRole() === 'Cupid' &&
            this.myTurnRole() === 'Cupid' &&
            this.state()?.nightNumber === 1 &&
            this.state()?.lovers === null &&
            !this.actionsTaken().has('cupid')
    );
    readonly showSeer = computed(
        () =>
            this.myRole() === 'Seer' &&
            this.myTurnRole() === 'Seer' &&
            !this.actionsTaken().has('seer')
    );
    readonly showWerewolf = computed(
        () =>
            this.myRole() === 'Werewolf' &&
            this.myTurnRole() === 'Werewolf' &&
            !this.actionsTaken().has('werewolf')
    );
    readonly showDoctor = computed(
        () =>
            this.myRole() === 'Doctor' &&
            this.myTurnRole() === 'Doctor' &&
            !this.actionsTaken().has('doctor')
    );
    readonly showWitch = computed(
        () =>
            this.myRole() === 'Witch' &&
            this.myTurnRole() === 'Witch' &&
            !this.actionsTaken().has('witch')
    );

    readonly secondsRemaining = computed(() => {
        const deadline = this.state()?.discussionDeadlineUtc;
        if (!deadline) {
            return null;
        }
        return Math.max(0, Math.floor((new Date(deadline).getTime() - this.nowMs()) / 1000));
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

    /** Phase banner content, keyed off GameStateService.currentView(). */
    readonly bannerIcon = computed(() => {
        switch (this.view()) {
            case 'lobby':
                return '🐺';
            case 'role-reveal':
            case 'night':
                return '🌙';
            case 'day-discussion':
                return '☀️';
            case 'voting':
                return '⚖️';
            case 'hunter-revenge':
                return '🏹';
            case 'game-over':
                return '🏆';
        }
    });
    readonly bannerStatus = computed(() => {
        switch (this.view()) {
            case 'lobby':
                return 'LOBBY';
            case 'role-reveal':
            case 'night':
                return `NIGHT ${this.state()?.nightNumber ?? ''}`;
            case 'day-discussion':
                return 'DAY DISCUSSION';
            case 'voting':
                return 'DAY VOTING';
            case 'hunter-revenge':
                return "HUNTER'S REVENGE";
            case 'game-over':
                return 'GAME OVER';
        }
    });
    readonly bannerInstruction = computed(() => {
        switch (this.view()) {
            case 'lobby':
                return 'Waiting for everyone to ready up.';
            case 'role-reveal':
            case 'night':
                return this.state()?.nightPrompt ?? 'Everyone else is asleep...';
            case 'day-discussion':
                return 'Cast your votes of suspicion!';
            case 'voting':
                return 'Choose who to send to the gallows.';
            case 'hunter-revenge':
                return 'The Hunter may take one soul down with them.';
            case 'game-over':
                return `${this.state()?.result?.winningFaction ?? ''} win!`;
        }
    });

    /** Header contextual action button -- replaces the mockup's fake "Switch to Night/Day" toggle
     * with whatever real host action applies to the current phase (null hides the button). */
    readonly headerAction = computed<{ label: string; disabled?: boolean } | null>(() => {
        if (!this.isHost()) {
            return this.view() === 'game-over' ? null : null;
        }
        switch (this.view()) {
            case 'lobby':
                return {
                    label: this.needsForceStart() ? 'Force Start' : 'Start Game',
                    disabled: !this.canStartGame()
                };
            case 'day-discussion':
                return { label: 'Advance to Voting' };
            case 'voting':
                return { label: 'Close Voting Early' };
            case 'game-over':
                return { label: 'Rematch in this room' };
            default:
                return null;
        }
    });

    readonly entries = computed<PlayerGridEntry[]>(() => {
        const lobby = this.lobby();
        const state = this.state();
        const myId = this.myPlayerId();
        const view = this.view();

        if (view === 'lobby') {
            return (lobby?.players ?? []).map((p) => ({
                playerId: p.playerId,
                displayName: p.displayName,
                isAlive: true,
                isMe: p.playerId === myId,
                isHost: p.playerId === lobby?.hostPlayerId,
                isReady: p.isReady,
                actionLabel: this.isHost() && p.playerId !== myId ? 'Kick' : undefined,
                actionVariant: 'danger' as const
            }));
        }

        if (!state) {
            return [];
        }

        const displayName = (playerId: string) => this.playerName(playerId);

        if (view === 'game-over') {
            const roles = state.result?.finalRoles ?? {};
            return state.players.map((p) => ({
                playerId: p.playerId,
                displayName: displayName(p.playerId),
                isAlive: p.isAlive,
                isMe: p.playerId === myId,
                isHost: p.playerId === lobby?.hostPlayerId,
                revealedRole: roles[p.playerId]
            }));
        }

        if (view === 'voting') {
            const alive = state.players.filter((p) => p.isAlive);
            return [
                ...alive.map((p) => ({
                    playerId: p.playerId,
                    displayName: displayName(p.playerId),
                    isAlive: true,
                    isMe: p.playerId === myId,
                    isHost: p.playerId === lobby?.hostPlayerId,
                    voteCount: this.voteCountFor(p.playerId),
                    selected: this.selectedVoteTarget() === p.playerId,
                    actionLabel: 'Vote',
                    actionVariant: 'accent' as const
                })),
                {
                    playerId: '__abstain__',
                    displayName: 'Abstain',
                    isAlive: true,
                    isMe: false,
                    isHost: false,
                    voteCount: this.abstainCount(),
                    selected: this.selectedVoteTarget() === null,
                    actionLabel: 'Vote',
                    actionVariant: 'accent' as const
                }
            ];
        }

        if (view === 'hunter-revenge') {
            const isMyTurn = state.pendingHunterRevenge[0] === myId;
            return state.players
                .filter((p) => p.isAlive)
                .map((p) => ({
                    playerId: p.playerId,
                    displayName: displayName(p.playerId),
                    isAlive: true,
                    isMe: p.playerId === myId,
                    isHost: p.playerId === lobby?.hostPlayerId,
                    actionLabel: isMyTurn && p.playerId !== myId ? 'Shoot' : undefined,
                    actionVariant: 'danger' as const
                }));
        }

        // 'role-reveal' and 'night' render identically -- the identity card handles the reveal moment.
        return state.players.map((p) => {
            const isTarget = p.playerId !== myId;
            let actionLabel: string | undefined;
            if (isTarget && p.isAlive) {
                if (this.showSeer()) {
                    actionLabel = 'Inspect';
                } else if (this.showWerewolf()) {
                    const excluded =
                        p.role === 'Werewolf' && !this.settings().werewolfCanTargetWerewolf;
                    actionLabel = excluded ? undefined : 'Attack';
                } else if (this.showDoctor()) {
                    const excluded =
                        p.playerId === this.lastDoctorTarget() ||
                        (p.playerId === myId && !this.settings().doctorCanSelfProtect);
                    actionLabel = excluded ? undefined : 'Protect';
                } else if (this.showWitch() && !this.witchPoisonUsed()) {
                    actionLabel = 'Poison';
                } else if (this.showCupid()) {
                    actionLabel = this.cupidFirstPick() === p.playerId ? 'Chosen' : 'Pick lover';
                }
            } else if (this.showDoctor() && this.settings().doctorCanSelfProtect) {
                actionLabel = this.lastDoctorTarget() === myId ? undefined : 'Protect';
            }
            return {
                playerId: p.playerId,
                displayName: displayName(p.playerId),
                isAlive: p.isAlive,
                isMe: p.playerId === myId,
                isHost: p.playerId === lobby?.hostPlayerId,
                actionLabel,
                actionVariant: 'accent' as const,
                actionDisabled: this.showCupid() && this.cupidFirstPick() === p.playerId
            };
        });
    });

    constructor() {
        effect(() => {
            const nightNumber = this.state()?.nightNumber;
            void nightNumber;
            this.actionsTaken.set(new Set());
            this.wolfVotes.set(new Map());
            this.wolfLockedTarget.set(undefined);
            this.seerResult.set(null);
            this.witchTarget.set(undefined);
            this.witchHealUsed.set(false);
            this.witchPoisonUsed.set(false);
            this.cupidFirstPick.set(null);
        });

        effect(() => {
            const role = this.myRole();
            if (!role) {
                this.roleDescription.set('');
                return;
            }
            void this.rulesApi.getRoles().then((roles) => {
                this.roleDescription.set(roles.find((r) => r.role === role)?.description ?? '');
            });
        });

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
            if (notification.kind === 'chat.room') {
                this.townMessages.update((messages) => [
                    ...messages,
                    {
                        senderId: notification.senderId,
                        senderName: this.playerName(notification.senderId),
                        text: notification.text,
                        sentAtUtc: notification.sentAtUtc
                    }
                ]);
            }
            if (notification.kind === 'seer.result') {
                this.seerResult.set({
                    targetPlayerId: notification.targetPlayerId,
                    isWerewolf: notification.isWerewolf
                });
            }
            if (notification.kind === 'player.died') {
                this.lastDeathText.set(
                    `${this.playerName(notification.playerId)} died (${notification.cause}).`
                );
            }
            if (notification.kind === 'vote.cast') {
                const next = new Map(this.votesByVoter());
                next.set(notification.voterPlayerId, notification.targetPlayerId);
                this.votesByVoter.set(next);
            }
        });

        const tickId = setInterval(() => this.nowMs.set(Date.now()), 1000);
        inject(DestroyRef).onDestroy(() => clearInterval(tickId));

        interval(WOLF_VOTE_POLL_MS)
            .pipe(
                switchMap(() => {
                    const code = this.roomCode();
                    if (!this.showWerewolf() || !code) {
                        return [];
                    }
                    return this.gameApi.getWerewolfVotes(code, this.myPlayerId());
                }),
                takeUntilDestroyed()
            )
            .subscribe((result) => {
                this.wolfVotes.set(new Map(Object.entries(result.votes)));
                this.wolfLockedTarget.set(result.lockedTarget);
            });

        effect(() => {
            const code = this.roomCode();
            if (!this.showWitch() || !code || this.witchTarget() !== undefined) {
                return;
            }
            this.gameApi
                .getWitchTarget(code, this.myPlayerId())
                .subscribe((result) => this.witchTarget.set(result.targetPlayerId));
        });
    }

    playerName(playerId: string): string {
        return this.lobby()?.players.find((p) => p.playerId === playerId)?.displayName ?? playerId;
    }

    voteCountFor(playerId: string): number {
        let count = 0;
        for (const target of this.votesByVoter().values()) {
            if (target === playerId) {
                count += 1;
            }
        }
        return count;
    }

    abstainCount(): number {
        let count = 0;
        for (const target of this.votesByVoter().values()) {
            if (target === null) {
                count += 1;
            }
        }
        return count;
    }

    selectChatTab(tab: ChatTab): void {
        this.chatTab.set(tab);
    }

    sendTownMessage(): void {
        const roomCode = this.roomCode();
        const text = this.draftMessage().trim();
        if (!roomCode || !text) {
            return;
        }
        this.gameApi
            .sendRoomChatMessage({ roomCode, playerId: this.myPlayerId(), text })
            .subscribe();
        this.draftMessage.set('');
    }

    /** Single entry point for every PlayerGrid `(action)` click -- dispatches by current view +
     * (for night) whichever role's turn it is, since the grid itself doesn't know game rules. */
    onGridAction(playerId: string): void {
        const roomCode = this.roomCode();
        if (!roomCode) {
            return;
        }
        switch (this.view()) {
            case 'lobby':
                this.kick(playerId);
                return;
            case 'voting':
                this.selectedVoteTarget.set(playerId === '__abstain__' ? null : playerId);
                return;
            case 'hunter-revenge':
                this.gameApi
                    .submitHunterRevengeShot({
                        roomCode,
                        playerId: this.myPlayerId(),
                        targetPlayerId: playerId
                    })
                    .subscribe();
                return;
            case 'game-over':
                return;
            default:
                this.onNightGridAction(roomCode, playerId);
        }
    }

    private onNightGridAction(roomCode: string, playerId: string): void {
        if (this.showSeer()) {
            this.gameApi
                .submitSeerInspection({
                    roomCode,
                    playerId: this.myPlayerId(),
                    targetPlayerId: playerId
                })
                .subscribe(() => this.markDone('seer'));
        } else if (this.showWerewolf()) {
            this.gameApi
                .submitWerewolfVote({
                    roomCode,
                    playerId: this.myPlayerId(),
                    targetPlayerId: playerId
                })
                .subscribe(() => this.markDone('werewolf'));
        } else if (this.showDoctor()) {
            this.gameApi
                .submitDoctorProtection({
                    roomCode,
                    playerId: this.myPlayerId(),
                    targetPlayerId: playerId
                })
                .subscribe(() => {
                    this.lastDoctorTarget.set(playerId);
                    this.markDone('doctor');
                });
        } else if (this.showWitch() && !this.witchPoisonUsed()) {
            this.gameApi
                .useWitchPoisonPotion({
                    roomCode,
                    playerId: this.myPlayerId(),
                    targetPlayerId: playerId
                })
                .subscribe(() => {
                    this.witchPoisonUsed.set(true);
                    this.finalizeWitchIfBothPotionsResolved();
                });
        } else if (this.showCupid()) {
            const first = this.cupidFirstPick();
            if (!first) {
                this.cupidFirstPick.set(playerId);
            } else if (first !== playerId) {
                this.gameApi
                    .submitCupidPairing({
                        roomCode,
                        playerId: this.myPlayerId(),
                        firstPlayerId: first,
                        secondPlayerId: playerId
                    })
                    .subscribe(() => this.markDone('cupid'));
            }
        }
    }

    private finalizeWitchIfBothPotionsResolved(): void {
        if (
            this.settings().witchSinglePotionPerNight ||
            (this.witchHealUsed() && this.witchPoisonUsed())
        ) {
            this.markDone('witch');
        }
    }

    private markDone(action: NightAction): void {
        const next = new Set(this.actionsTaken());
        next.add(action);
        this.actionsTaken.set(next);
    }

    witchHealAction(): void {
        const roomCode = this.roomCode();
        if (!roomCode) {
            return;
        }
        this.gameApi.useWitchHealPotion({ roomCode, playerId: this.myPlayerId() }).subscribe(() => {
            this.witchHealUsed.set(true);
            this.finalizeWitchIfBothPotionsResolved();
        });
    }

    witchPassAction(): void {
        const roomCode = this.roomCode();
        if (!roomCode) {
            return;
        }
        this.gameApi
            .passWitch({ roomCode, playerId: this.myPlayerId() })
            .subscribe(() => this.markDone('witch'));
    }

    werewolfPassAction(): void {
        const roomCode = this.roomCode();
        if (!roomCode) {
            return;
        }
        this.gameApi
            .submitWerewolfVote({
                roomCode,
                playerId: this.myPlayerId(),
                targetPlayerId: undefined
            })
            .subscribe(() => this.markDone('werewolf'));
    }

    hunterPassAction(): void {
        const roomCode = this.roomCode();
        if (!roomCode) {
            return;
        }
        this.gameApi.passHunterRevenge({ roomCode, playerId: this.myPlayerId() }).subscribe();
    }

    submitVoteAction(): void {
        const roomCode = this.roomCode();
        const selected = this.selectedVoteTarget();
        if (!roomCode || selected === undefined) {
            return;
        }
        this.gameApi
            .castVote({
                roomCode,
                voterPlayerId: this.myPlayerId(),
                targetPlayerId: selected ?? undefined
            })
            .subscribe();
    }

    votedCount(): number {
        return this.votesByVoter().size;
    }

    private kick(playerId: string): void {
        const lobby = this.lobby();
        if (!lobby) {
            return;
        }
        const kicked = lobby.players.find((p) => p.playerId === playerId);
        this.lobbyApi
            .kickPlayer({ roomCode: lobby.roomCode, requestedBy: this.myPlayerId(), playerId })
            .subscribe({
                next: () => {
                    this.gameState.lobby.set({
                        ...lobby,
                        players: lobby.players.filter((p) => p.playerId !== playerId)
                    });
                    if (kicked) {
                        this.toast.show(`${kicked.displayName} was kicked from the lobby.`, 'info');
                    }
                },
                error: (error: unknown) =>
                    this.toast.show(
                        extractErrorMessage(error, 'Could not kick that player.'),
                        'error'
                    )
            });
    }

    readyToggleAction(): void {
        const lobby = this.lobby();
        const me = this.myPlayer();
        if (!lobby || !me) {
            return;
        }
        const nextReady = !me.isReady;
        this.lobbyApi
            .setReady({ roomCode: lobby.roomCode, playerId: this.myPlayerId(), isReady: nextReady })
            .subscribe({
                next: () =>
                    this.gameState.lobby.set({
                        ...lobby,
                        players: lobby.players.map((p) =>
                            p.playerId === me.playerId ? { ...p, isReady: nextReady } : p
                        )
                    }),
                error: (error: unknown) =>
                    this.toast.show(
                        extractErrorMessage(error, 'Could not update ready state.'),
                        'error'
                    )
            });
    }

    cancelLobbyAction(): void {
        const lobby = this.lobby();
        if (!lobby) {
            return;
        }
        this.lobbyApi
            .cancelLobby({ roomCode: lobby.roomCode, requestedBy: this.myPlayerId() })
            .subscribe({
                next: () => {
                    this.playerIdentity.clearActiveRoom();
                    void this.router.navigate(['/']);
                },
                error: (error: unknown) =>
                    this.toast.show(
                        extractErrorMessage(error, 'Could not cancel the lobby.'),
                        'error'
                    )
            });
    }

    leaveLobbyAction(): void {
        const lobby = this.lobby();
        if (!lobby) {
            return;
        }
        this.lobbyApi
            .leaveLobby({ roomCode: lobby.roomCode, playerId: this.myPlayerId() })
            .subscribe({
                next: () => {
                    this.playerIdentity.clearActiveRoom();
                    void this.router.navigate(['/']);
                },
                error: (error: unknown) =>
                    this.toast.show(
                        extractErrorMessage(error, 'Could not leave the lobby.'),
                        'error'
                    )
            });
    }

    advanceToVotingAction(): void {
        const roomCode = this.roomCode();
        if (!roomCode) {
            return;
        }
        this.gameApi.advanceToVoting({ roomCode, requestedBy: this.myPlayerId() }).subscribe();
    }

    closeVotingAction(): void {
        const roomCode = this.roomCode();
        if (!roomCode) {
            return;
        }
        this.gameApi.closeVoting({ roomCode, requestedBy: this.myPlayerId() }).subscribe();
    }

    viewLogAction(): void {
        const roomCode = this.roomCode();
        if (!roomCode) {
            return;
        }
        this.gameApi.getLog(roomCode).subscribe((log) => this.logEntries.set(log.entries));
    }

    leaveRoomAction(): void {
        this.playerIdentity.clearActiveRoom();
        void this.router.navigate(['/']);
    }

    startRematchAction(): void {
        const roomCode = this.roomCode();
        if (!roomCode) {
            return;
        }
        this.lobbyApi.rematch({ roomCode, requestedBy: this.myPlayerId() }).subscribe({
            next: () => {
                this.gameState.resetForRematch();
                void this.gameState.refreshLobby(roomCode);
            },
            error: (error: unknown) =>
                this.toast.show(extractErrorMessage(error, 'Could not start a rematch.'), 'error')
        });
    }

    /** Header contextual button click -- dispatches to whichever action `headerAction()` is
     * currently describing. */
    onHeaderAction(): void {
        const lobby = this.lobby();
        if (!lobby) {
            return;
        }
        switch (this.view()) {
            case 'lobby':
                this.lobbyApi
                    .startGame({
                        roomCode: lobby.roomCode,
                        requestedBy: this.myPlayerId(),
                        forceStart: this.needsForceStart()
                    })
                    .subscribe({
                        next: () => void this.gameState.refreshGameState(lobby.roomCode),
                        error: (error: unknown) =>
                            this.toast.show(
                                extractErrorMessage(error, 'Could not start the game.'),
                                'error'
                            )
                    });
                return;
            case 'day-discussion':
                this.advanceToVotingAction();
                return;
            case 'voting':
                this.closeVotingAction();
                return;
            case 'game-over':
                this.startRematchAction();
                return;
        }
    }
}
```

- [ ] **Step 2: Write the template**

```html
<!-- src/app/shared/components/room-shell/room-shell.html -->
<div class="room-shell" [attr.data-phase]="isNight() ? 'night' : 'day'">
    <header class="room-shell__header">
        <div class="room-shell__logo">🔮 LUNARIS</div>
        <div class="room-shell__header-actions">
            <button type="button" class="room-shell__ghost-button" (click)="showSettings.set(true)">
                ⚙️ Rules & Setup
            </button>
            @if (headerAction(); as action) {
            <button
                type="button"
                class="room-shell__cta"
                [disabled]="action.disabled"
                (click)="onHeaderAction()"
            >
                {{ action.label }}
            </button>
            }
        </div>
    </header>

    <div class="room-shell__viewport">
        <aside class="room-shell__left">
            <app-identity-grimoire-card [role]="myRole()" [description]="roleDescription()"></app-identity-grimoire-card>

            <div class="room-shell__stats">
                <h3>Coven Live Overview</h3>
                <div class="room-shell__stats-grid">
                    <div class="room-shell__stat room-shell__stat--alive">
                        <span>Living Souls</span>
                        <strong>{{ aliveCount() }}</strong>
                    </div>
                    <div class="room-shell__stat room-shell__stat--dead">
                        <span>Spectral Ghosts</span>
                        <strong>{{ deadCount() }}</strong>
                    </div>
                </div>
                @if (ownObjective()) {
                <p class="room-shell__objective">{{ ownObjective() }}</p>
                }
            </div>
        </aside>

        <section class="room-shell__center">
            <app-phase-banner
                [icon]="bannerIcon()"
                [status]="bannerStatus()"
                [instruction]="bannerInstruction()"
                [countdown]="countdownDisplay()"
                countdownLabel="Discussion ends in"
                [countdownExpired]="secondsRemaining() === 0"
            ></app-phase-banner>

            @if (lastDeathText(); as death) {
            <p class="room-shell__death">{{ death }}</p>
            }

            <app-player-grid [entries]="entries()" (action)="onGridAction($event)"></app-player-grid>

            <app-room-action-panel
                [showReadyToggle]="view() === 'lobby' && !isHost()"
                [isReady]="myPlayer()?.isReady ?? false"
                (readyToggle)="readyToggleAction()"
                [showCancelLobby]="view() === 'lobby' && isHost()"
                (cancelLobby)="cancelLobbyAction()"
                [showLeaveLobby]="view() === 'lobby' && !isHost()"
                (leaveLobby)="leaveLobbyAction()"
                [werewolfTally]="showWerewolf() ? null : null"
                [showWerewolfPass]="showWerewolf() && settings().werewolfCanVoteNoKill"
                (werewolfPass)="werewolfPassAction()"
                [seerResult]="
                    seerResult()
                        ? playerName(seerResult()!.targetPlayerId) + ' is ' + (seerResult()!.isWerewolf ? 'a werewolf' : 'NOT a werewolf')
                        : null
                "
                [witchTargetInfo]="
                    showWitch() && witchTarget() !== undefined
                        ? witchTarget()
                            ? 'The werewolves are coming for ' + playerName(witchTarget()!) + ' tonight.'
                            : \"You don't know who the werewolves targeted tonight.\"
                        : null
                "
                [showWitchHeal]="showWitch() && !witchHealUsed()"
                (witchHeal)="witchHealAction()"
                [showWitchPass]="showWitch()"
                [witchPassLabel]="witchHealUsed() || witchPoisonUsed() ? 'End turn' : 'Pass (use neither potion)'"
                (witchPass)="witchPassAction()"
                [cupidHint]="showCupid() ? (cupidFirstPickHint()) : null"
                [waitingText]="
                    (view() === 'night' || view() === 'role-reveal') &&
                    !showCupid() && !showSeer() && !showWerewolf() && !showDoctor() && !showWitch()
                        ? bannerInstruction()
                        : null
                "
                [showSubmitVote]="view() === 'voting' && selectedVoteTarget() !== undefined"
                (submitVote)="submitVoteAction()"
                [voteTally]="view() === 'voting' ? votedCount() + ' / ' + (state()?.players?.length ?? 0) + ' voted' : null"
                [showHunterPass]="view() === 'hunter-revenge' && state()?.pendingHunterRevenge?.[0] === myPlayerId()"
                (hunterPass)="hunterPassAction()"
                [showViewLog]="view() === 'game-over'"
                (viewLog)="viewLogAction()"
                [logEntries]="logEntries()"
                [showLeaveRoom]="view() === 'game-over'"
                (leaveRoom)="leaveRoomAction()"
            ></app-room-action-panel>
        </section>

        <aside class="room-shell__chat">
            <div class="room-shell__chat-tabs">
                <button
                    type="button"
                    class="room-shell__chat-tab"
                    [class.room-shell__chat-tab--active]="chatTab() === 'town'"
                    (click)="selectChatTab('town')"
                >
                    Public Square
                </button>
                @if (canSeePackChat()) {
                <button
                    type="button"
                    class="room-shell__chat-tab room-shell__chat-tab--danger"
                    [class.room-shell__chat-tab--active]="chatTab() === 'pack'"
                    (click)="selectChatTab('pack')"
                >
                    Private Grimoires
                </button>
                }
            </div>

            @if (chatTab() === 'town') {
            <div class="room-shell__chat-history">
                @for (message of townMessages(); track message.sentAtUtc + message.senderId) {
                <p class="room-shell__chat-message">
                    <span class="room-shell__chat-sender">{{ message.senderName }}:</span> {{ message.text }}
                </p>
                }
            </div>
            <form class="room-shell__chat-input-area" (ngSubmit)="sendTownMessage()">
                <input
                    type="text"
                    placeholder="Cast suspicion or whisper secret info..."
                    [ngModel]="draftMessage()"
                    (ngModelChange)="draftMessage.set($event)"
                    name="townMessage"
                />
            </form>
            } @else {
            <div class="room-shell__chat-history">
                <p class="room-shell__chat-disabled">
                    Private Grimoires isn't wired up yet. Coordinate over voice or a group chat outside the app.
                </p>
            </div>
            }
        </aside>
    </div>

    @if (showSettings()) {
    <app-settings-modal [readOnly]="view() !== 'lobby'" (closed)="showSettings.set(false)"></app-settings-modal>
    }
</div>
```

Note: `cupidFirstPickHint()` referenced above is a small helper — add it to the class in Step 1's file (append near `playerName`):

```typescript
    cupidFirstPickHint(): string {
        const first = this.cupidFirstPick();
        return first ? `First love chosen: ${this.playerName(first)}. Pick the second.` : 'Pick your first love.';
    }
```

- [ ] **Step 3: Write the stylesheet**

```scss
// src/app/shared/components/room-shell/room-shell.scss
.room-shell {
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

    display: flex;
    flex-direction: column;
    height: 100vh;
    background-color: var(--bg-main);
    background-image: radial-gradient(
        circle at 50% 0%,
        color-mix(in srgb, var(--primary) 12%, transparent) 0%,
        var(--bg-main) 70%
    );
    color: var(--text-main);
    overflow: hidden;

    &__header {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        align-items: center;
        gap: 0.75rem;
        padding: 1rem 1.5rem;
        border-bottom: 1px solid var(--border);
        background: color-mix(in srgb, var(--bg-main) 80%, transparent);
        backdrop-filter: blur(16px);
    }

    &__logo {
        font-size: 1.15rem;
        font-weight: 700;
        letter-spacing: 0.05em;
    }

    &__header-actions {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
    }

    &__ghost-button {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        border: 1px solid var(--border);
        background: var(--bg-surface);
        color: var(--text-main);
        border-radius: 0.75rem;
        padding: 0.55rem 0.9rem;
        font-size: 0.75rem;
        font-weight: 600;
        cursor: pointer;

        &:hover {
            border-color: var(--primary);
        }
    }

    &__cta {
        border: none;
        border-radius: 999px;
        padding: 0.55rem 1.25rem;
        font-weight: 700;
        font-size: 0.75rem;
        color: white;
        cursor: pointer;
        background: linear-gradient(135deg, var(--accent-day), #ea580c);
        box-shadow: 0 4px 15px color-mix(in srgb, var(--primary) 25%, transparent);

        &[data-phase='night'],
        .room-shell[data-phase='night'] & {
            background: linear-gradient(135deg, #8b5cf6, #6366f1);
        }

        &:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }
    }

    &__viewport {
        flex: 1;
        display: grid;
        grid-template-columns: 300px 1fr 320px;
        gap: 1.25rem;
        padding: 1.25rem;
        min-height: 0;
        overflow: hidden;

        @media (max-width: 900px) {
            grid-template-columns: 1fr;
            overflow-y: auto;
        }
    }

    &__left {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        overflow-y: auto;
    }

    &__stats {
        background: var(--bg-surface);
        border: 1px solid var(--border);
        border-radius: 1rem;
        padding: 1.1rem;

        h3 {
            margin: 0 0 0.75rem;
            font-size: 0.7rem;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: var(--text-muted);
        }
    }

    &__stats-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.6rem;
        text-align: center;
    }

    &__stat {
        border-radius: 0.75rem;
        padding: 0.6rem;
        display: flex;
        flex-direction: column;
        gap: 0.2rem;

        span {
            font-size: 0.6rem;
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }

        strong {
            font-size: 1.35rem;
        }

        &--alive {
            background: color-mix(in srgb, var(--success) 8%, transparent);
            border: 1px solid color-mix(in srgb, var(--success) 20%, transparent);
            color: var(--success);
        }

        &--dead {
            background: color-mix(in srgb, var(--danger) 8%, transparent);
            border: 1px solid color-mix(in srgb, var(--danger) 20%, transparent);
            color: var(--danger);
        }
    }

    &__objective {
        margin: 0.85rem 0 0;
        padding-top: 0.75rem;
        border-top: 1px solid var(--border);
        font-size: 0.75rem;
        color: var(--text-muted);
    }

    &__center {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        overflow-y: auto;
        min-height: 0;
    }

    &__death {
        margin: 0;
        font-size: 0.8rem;
        color: var(--danger);
    }

    &__chat {
        background: var(--bg-surface);
        border: 1px solid var(--border);
        border-radius: 1rem;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        min-height: 0;

        @media (max-width: 900px) {
            min-height: 50vh;
        }
    }

    &__chat-tabs {
        display: flex;
        border-bottom: 1px solid var(--border);
        background: var(--bg-main);
    }

    &__chat-tab {
        flex: 1;
        background: transparent;
        border: none;
        color: var(--text-muted);
        padding: 0.75rem;
        font-size: 0.7rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        cursor: pointer;

        &--active {
            color: var(--text-main);
            border-bottom: 2px solid var(--primary);
        }

        &--danger {
            color: var(--danger);
        }
    }

    &__chat-history {
        flex: 1;
        padding: 1rem;
        overflow-y: auto;
    }

    &__chat-message {
        margin: 0 0 0.6rem;
        font-size: 0.8rem;
        line-height: 1.4;
    }

    &__chat-sender {
        font-weight: 700;
        color: var(--primary);
        margin-right: 0.3rem;
    }

    &__chat-disabled {
        color: var(--text-muted);
        font-style: italic;
        font-size: 0.85rem;
    }

    &__chat-input-area {
        padding: 0.85rem;
        border-top: 1px solid var(--border);
        background: var(--bg-nested);

        input {
            width: 100%;
            background: var(--bg-main);
            border: 1px solid var(--border);
            border-radius: 0.75rem;
            padding: 0.6rem 0.75rem;
            color: var(--text-main);
            outline: none;

            &:focus {
                border-color: var(--primary);
            }
        }
    }
}
```

- [ ] **Step 4: Verify it builds**

Run: `npx ng build --configuration development`
Expected: `Build succeeded.` (still unreferenced by any route, so this only confirms type-correctness).

- [ ] **Step 5: Commit**

```bash
git add src/app/shared/components/room-shell/
git commit -m "Add RoomShell: unified lobby+game view matching the LUNARIS mockup"
```

---

### Task 6: Point `RoomComponent` at `RoomShell` and delete the retired screens

**Files:**

- Modify: `src/app/features/room/room.component.ts`
- Modify: `src/app/features/room/room.component.html`
- Delete: `src/app/features/room/lobby-screen/` (entire folder, including `settings-modal/` — **move** `settings-modal/` up to `src/app/shared/components/settings-modal/` first, since `RoomShell` imports it)
- Delete: `src/app/features/room/role-reveal-screen/`
- Delete: `src/app/features/room/night-action-panel/`
- Delete: `src/app/features/room/day-discussion-screen/`
- Delete: `src/app/features/room/voting-screen/`
- Delete: `src/app/features/room/hunter-revenge-modal/`
- Delete: `src/app/features/room/game-over-screen/`
- Delete: `src/app/shared/components/game-shell/` (superseded by `room-shell` in Task 5)
- Delete: `src/app/shared/components/game-table/` (only used by the retired screens — confirm with grep in Step 1)
- Delete: `src/app/shared/components/player-picker/` (only used by the retired screens — confirm with grep in Step 1)

**Interfaces:**

- Consumes: `RoomShell` (Task 5).
- Produces: `RoomComponent` template that always renders `<app-room-shell>` behind the existing `needsDisplayName` gate.

- [ ] **Step 1: Confirm `game-table` and `player-picker` have no other consumers**

```bash
grep -rl "GameTable\|app-game-table" src/app --include=*.ts --include=*.html
grep -rl "PlayerPicker\|app-player-picker" src/app --include=*.ts --include=*.html
```

Expected: only files inside `lobby-screen/`, `night-action-panel/`, `voting-screen/`, `hunter-revenge-modal/` (the folders being deleted this task). If anything else matches, stop and re-check the delete list before proceeding.

- [ ] **Step 2: Move `settings-modal` out of `lobby-screen`**

```bash
git mv src/app/features/room/lobby-screen/settings-modal src/app/shared/components/settings-modal
```

Update its import path inside `room-shell.ts` (from Task 5, Step 1) — it already reads:

```typescript
import { SettingsModal } from '../../../features/room/lobby-screen/settings-modal/settings-modal';
```

change to:

```typescript
import { SettingsModal } from '../settings-modal/settings-modal';
```

- [ ] **Step 3: Update `room.component.ts`**

```typescript
// src/app/features/room/room.component.ts
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { GameApiService } from '../../core/services/game-api.service';
import { GameStateService } from '../../core/services/game-state.service';
import { LobbyApiService } from '../../core/services/lobby-api.service';
import { PlayerIdentityService } from '../../core/services/player-identity.service';
import { ToastService } from '../../core/services/toast.service';
import { WerewolfHubService } from '../../core/services/werewolf-hub.service';
import { resolveUniqueDisplayName } from '../../core/utils/display-name.util';
import { extractErrorMessage } from '../../core/utils/http-error.util';
import { ToastList } from '../../shared/components/toast-list/toast-list';
import { ConfirmDialog } from '../../shared/components/confirm-dialog/confirm-dialog';
import { JoinNamePrompt } from './join-name-prompt/join-name-prompt';
import { RoomShell } from '../../shared/components/room-shell/room-shell';

@Component({
    selector: 'app-room',
    imports: [ToastList, ConfirmDialog, JoinNamePrompt, RoomShell],
    templateUrl: './room.component.html',
    styleUrl: './room.component.scss'
})
export class RoomComponent implements OnInit, OnDestroy {
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly hub = inject(WerewolfHubService);
    private readonly lobbyApi = inject(LobbyApiService);
    private readonly gameApi = inject(GameApiService);
    private readonly playerIdentity = inject(PlayerIdentityService);
    private readonly toast = inject(ToastService);
    readonly gameStateService = inject(GameStateService);

    private roomCode = '';
    readonly needsDisplayName = signal(false);
    readonly showQuitConfirm = signal(false);

    readonly canQuit = computed(
        () => !['lobby', 'game-over'].includes(this.gameStateService.currentView())
    );

    ngOnInit(): void {
        this.roomCode = this.route.snapshot.paramMap.get('roomCode') ?? '';
        this.gameStateService.roomCode.set(this.roomCode);

        if (this.playerIdentity.displayName().trim()) {
            void this.joinAndEnter();
        } else {
            this.needsDisplayName.set(true);
        }
    }

    onDisplayNameConfirmed(displayName: string): void {
        this.playerIdentity.setDisplayName(displayName);
        this.needsDisplayName.set(false);
        void this.joinAndEnter();
    }

    private async joinAndEnter(): Promise<void> {
        const myPlayerId = this.playerIdentity.playerId();

        const [existingLobby, existingGame] = await Promise.all([
            firstValueFrom(this.lobbyApi.getLobby(this.roomCode)).catch(() => null),
            firstValueFrom(this.gameApi.getState(this.roomCode)).catch(() => null)
        ]);

        const alreadyJoined =
            (existingGame?.players.some((player) => player.playerId === myPlayerId) ?? false) ||
            (existingLobby?.players.some((player) => player.playerId === myPlayerId) ?? false);

        if (alreadyJoined) {
            if (existingGame) {
                this.gameStateService.hasSeenRoleReveal.set(true);
            }
            this.enterRoom();
            return;
        }

        if (!existingLobby) {
            this.toast.show('Could not join that room. Check the code and try again.', 'error');
            void this.router.navigate(['/']);
            return;
        }

        const takenNames = existingLobby.players.map((player) => player.displayName);
        const displayName = resolveUniqueDisplayName(this.playerIdentity.displayName(), takenNames);

        this.lobbyApi
            .joinLobby({ roomCode: this.roomCode, playerId: myPlayerId, displayName })
            .subscribe({
                next: () => this.enterRoom(),
                error: (error: unknown) => {
                    this.toast.show(
                        extractErrorMessage(
                            error,
                            'Could not join that room. Check the code and try again.'
                        ),
                        'error'
                    );
                    void this.router.navigate(['/']);
                }
            });
    }

    private enterRoom(): void {
        this.playerIdentity.setActiveRoom(this.roomCode);
        void this.hub
            .connect()
            .then(() => this.hub.joinRoom(this.roomCode, this.playerIdentity.playerId()));
        void this.gameStateService.refreshLobby(this.roomCode);
        void this.gameStateService.refreshGameState(this.roomCode);
        this.gameStateService.startSync();
    }

    quitGame(): void {
        this.showQuitConfirm.set(true);
    }

    confirmQuit(): void {
        this.showQuitConfirm.set(false);
        this.playerIdentity.clearActiveRoom();
        void this.gameStateService.quitGame(this.roomCode);
    }

    cancelQuit(): void {
        this.showQuitConfirm.set(false);
    }

    ngOnDestroy(): void {
        this.gameStateService.stopSync();
        void this.hub.leaveRoom(this.roomCode, this.playerIdentity.playerId());
        void this.hub.disconnect();
    }
}
```

(The only change from the current file: the seven phase-screen imports are replaced with a single `RoomShell` import/registration; every method is unchanged.)

- [ ] **Step 4: Update `room.component.html`**

```html
<!-- src/app/features/room/room.component.html -->
<app-toast-list></app-toast-list>

@if (canQuit()) {
<button type="button" class="room__quit-button" (click)="quitGame()">Quit game</button>
} @if (showQuitConfirm()) {
<app-confirm-dialog
    title="Quit this game?"
    message="You will be marked dead and cannot rejoin."
    confirmLabel="Quit"
    cancelLabel="Stay"
    (confirmed)="confirmQuit()"
    (cancelled)="cancelQuit()"
></app-confirm-dialog>
} @if (needsDisplayName()) {
<app-join-name-prompt (confirmed)="onDisplayNameConfirmed($event)"></app-join-name-prompt>
} @else {
<app-room-shell></app-room-shell>
}
```

- [ ] **Step 5: Delete the retired folders**

```bash
git rm -r src/app/features/room/lobby-screen
git rm -r src/app/features/room/role-reveal-screen
git rm -r src/app/features/room/night-action-panel
git rm -r src/app/features/room/day-discussion-screen
git rm -r src/app/features/room/voting-screen
git rm -r src/app/features/room/hunter-revenge-modal
git rm -r src/app/features/room/game-over-screen
git rm -r src/app/shared/components/game-shell
git rm -r src/app/shared/components/game-table
git rm -r src/app/shared/components/player-picker
```

(`settings-modal` was already `git mv`'d out in Step 2, so `lobby-screen`'s removal won't take it along.)

- [ ] **Step 6: Build**

Run: `npx ng build --configuration development`
Expected: `Build succeeded.` with no "file not found" / unresolved-import errors. If any remain, they'll name the stale import path — fix it before proceeding.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Replace the 7 phase-switched room screens with the unified RoomShell"
```

---

### Task 7: Manual verification

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

```bash
npm start
```

Wait for `Application bundle generation complete.` in the output before proceeding.

- [ ] **Step 2: Drive it with Playwright and screenshot every phase**

This project has no backend running in this environment, so state is injected directly into `GameStateService`'s public signals (`roomCode`, `lobby`, `gameState`) via `window.ng.getComponent()` on the mounted `<app-room>` element — the same technique already used earlier in this project to verify the LUNARIS `game-shell` wiring. Write a script at a scratch path (adjust the two absolute paths for your machine):

```javascript
// scratch/verify-room-shell.js
const { chromium } = require('playwright');

async function shootPhase(page, roomCode, overrides, filename) {
    await page.evaluate(
        ({ roomCode, overrides }) => {
            const el = document.querySelector('app-room');
            const comp = window.ng.getComponent(el);
            comp.needsDisplayName.set(false);
            const svc = comp.gameStateService;
            svc.roomCode.set(roomCode);
            svc.hasSeenRoleReveal.set(true);
            svc.lobby.set(overrides.lobby);
            svc.gameState.set(overrides.gameState);
        },
        { roomCode, overrides }
    );
    await page.waitForTimeout(500);
    await page.screenshot({ path: filename });
}

const players = [
    { playerId: 'me', displayName: 'Dat', isReady: true },
    { playerId: 'p2', displayName: 'Alice', isReady: true },
    { playerId: 'p3', displayName: 'Bob', isReady: false },
    { playerId: 'p4', displayName: 'Chao', isReady: true },
    { playerId: 'p5', displayName: 'Eve', isReady: true },
    { playerId: 'p6', displayName: 'Finn', isReady: true }
];

const lobby = {
    roomCode: 'LUNAR1',
    hostPlayerId: 'me',
    players,
    roleDistribution: {},
    settings: {
        revealRoleOnDeath: true,
        doctorCanSelfProtect: true,
        werewolfRequiresConsensus: true,
        werewolfCanTargetWerewolf: false,
        werewolfCanVoteNoKill: true,
        witchSinglePotionPerNight: false,
        minPlayers: 5,
        allowForceStart: false,
        witchKnowsWerewolfTarget: true,
        discussionDurationSeconds: 120
    },
    status: 'Open',
    version: 1
};

const roles = ['Werewolf', 'Villager', 'Seer', 'Doctor', 'Villager', 'Witch'];
const basePlayers = players.map((p, i) => ({
    playerId: p.playerId,
    role: roles[i],
    isAlive: i !== 3
}));

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext({
        ignoreHTTPSErrors: true,
        viewport: { width: 1440, height: 900 }
    });
    const page = await context.newPage();
    page.on('pageerror', (err) => console.log('[pageerror]', err.message));

    await page.goto('https://localhost:4200/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.setItem('werewolf.playerId', 'me'));
    await page.goto('https://localhost:4200/room/LUNAR1', { waitUntil: 'networkidle' });
    await page.waitForSelector('app-room', { timeout: 15000 });

    await shootPhase(
        page,
        'LUNAR1',
        { lobby: { ...lobby, status: 'Open' }, gameState: null },
        'phase-lobby.png'
    );

    await shootPhase(
        page,
        'LUNAR1',
        {
            lobby: { ...lobby, status: 'Closed' },
            gameState: {
                roomCode: 'LUNAR1',
                phase: 'Night',
                nightNumber: 2,
                dayNumber: 1,
                players: basePlayers,
                lovers: null,
                werewolfLockedTarget: null,
                pendingHunterRevenge: [],
                result: null,
                currentNightRole: 'Werewolf',
                nightPrompt: 'Werewolves, choose your victim.',
                discussionDeadlineUtc: null,
                version: 1
            }
        },
        'phase-night.png'
    );

    await shootPhase(
        page,
        'LUNAR1',
        {
            lobby: { ...lobby, status: 'Closed' },
            gameState: {
                roomCode: 'LUNAR1',
                phase: 'DayDiscussion',
                nightNumber: 2,
                dayNumber: 2,
                players: basePlayers,
                lovers: null,
                werewolfLockedTarget: null,
                pendingHunterRevenge: [],
                result: null,
                currentNightRole: null,
                nightPrompt: null,
                discussionDeadlineUtc: new Date(Date.now() + 90000).toISOString(),
                version: 2
            }
        },
        'phase-day-discussion.png'
    );

    await shootPhase(
        page,
        'LUNAR1',
        {
            lobby: { ...lobby, status: 'Closed' },
            gameState: {
                roomCode: 'LUNAR1',
                phase: 'DayVoting',
                nightNumber: 2,
                dayNumber: 2,
                players: basePlayers,
                lovers: null,
                werewolfLockedTarget: null,
                pendingHunterRevenge: [],
                result: null,
                currentNightRole: null,
                nightPrompt: null,
                discussionDeadlineUtc: null,
                version: 3
            }
        },
        'phase-voting.png'
    );

    await shootPhase(
        page,
        'LUNAR1',
        {
            lobby: { ...lobby, status: 'Closed' },
            gameState: {
                roomCode: 'LUNAR1',
                phase: 'GameOver',
                nightNumber: 2,
                dayNumber: 2,
                players: basePlayers,
                lovers: null,
                werewolfLockedTarget: null,
                pendingHunterRevenge: [],
                result: {
                    winningFaction: 'Villagers',
                    endedAtUtc: new Date().toISOString(),
                    finalRoles: Object.fromEntries(basePlayers.map((p) => [p.playerId, p.role]))
                },
                currentNightRole: null,
                nightPrompt: null,
                discussionDeadlineUtc: null,
                version: 4
            }
        },
        'phase-game-over.png'
    );

    await browser.close();
})();
```

Run it with Node against the globally-cached Playwright install (adjust the `NODE_PATH` to whatever `npm root -g`/npx-cache path resolves on your machine):

```bash
node scratch/verify-room-shell.js
```

- [ ] **Step 3: Look at each screenshot**

Open `phase-lobby.png`, `phase-night.png`, `phase-day-discussion.png`, `phase-voting.png`, `phase-game-over.png`. Confirm for each:

- The 3-column layout renders (Identity Grimoire + stats / phase banner + player grid + action panel / chat) — no blank panels.
- `phase-lobby.png`: player cards show Ready/Not-ready state and a Kick button on non-host cards (viewed as the host, `me`).
- `phase-night.png`: Identity card shows "Werewolf" on the back (or front placeholder if not yet flipped — click behavior can't be captured by a static screenshot, but the card should render); player grid shows an "Attack" button on alive opponents.
- `phase-day-discussion.png`: countdown clock visible in the phase banner, ticking down from ~01:30.
- `phase-voting.png`: "Vote" button + vote counts on each card, "Submit Vote" appears in the action panel only after a card is clicked (a static screenshot before any click won't show it — that's expected).
- `phase-game-over.png`: player grid shows each player's revealed role instead of an action button.

Check the terminal output for any `[pageerror]` lines — none should appear.

- [ ] **Step 4: Report and clean up**

If everything above holds, verification passes — no commit needed (this task produced no source changes). If something's off, fix the relevant component from Tasks 1-6 and re-run Step 2.

---

## Self-Review Notes

- **Spec coverage:** Architecture (Task 5/6), layout/visual match (Tasks 1-5), lobby/kick/ready (Task 5's `entries`/`readyToggleAction`/`kick`), role-reveal via flip card (Task 1), night per-role actions (Task 5's `onNightGridAction`), day-discussion countdown + advance (Task 5's `countdownDisplay`/`advanceToVotingAction`), voting + close-early (Task 5's voting branch), hunter-revenge (Task 5's `hunter-revenge` branch), game-over reveal + rematch (Task 5's `game-over` branch + `startRematchAction`), chat relabeling (Task 5's template) — all covered.
- **Type consistency:** `PlayerGridEntry`, `RoomActionPanel`'s inputs/outputs, and `RoomShell`'s usage of both were cross-checked for matching names (`actionLabel`/`actionVariant`/`actionDisabled`/`revealedRole`, `readyToggle`/`witchHeal`/`witchPass`/etc.) across Tasks 3, 4, and 5.
- **`role-card`/`animated-card`:** kept — reused by `PlayerGrid`'s `revealedRole` branch (Task 3) — not deleted anywhere in Task 6's delete list.
