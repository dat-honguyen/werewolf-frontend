# Game-Feel Polish Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the live `RoomShell` game screen (not the unused `player-card`/`phase-transition`
components) read as a horror party game instead of a flat admin panel: role-flavored night-action
feedback, a real night/day transition with a moon-phase cue, a sequenced death animation, a
horror-themed backdrop built from real CC0 assets, a role-tinted own-identity card, and a button
color-semantics fix.

**Architecture:** Four new pure, unit-tested utility functions (`role-accent`, `phase-family`,
`moon-phase`, `death-diff`) drive presentation decisions that `RoomShell` exposes as computed
signals / CSS custom properties. `PlayerGrid` and `IdentityGrimoireCard` consume those custom
properties (`--action-accent`, `--role-accent`) with `var(..., var(--primary))` fallbacks, so
every other call site keeps working unchanged. A new `RoomBackdrop` presentational component
holds the three CC0 SVG assets. `PhaseTransition` (currently unwired) gets ported from the dead
global token set onto `RoomShell`'s live tokens and mounted for real.

**Tech Stack:** Angular 22 standalone components, signals (`computed`/`effect`/`signal`), SCSS
with CSS custom properties, Jasmine/Karma (`ng test`) for unit tests, existing Playwright e2e
suite for visual/behavioral regression.

## Global Constraints

- Every task targets the **live** component tree (`RoomShell` → `PlayerGrid` /
  `RoomActionPanel` / `IdentityGrimoireCard`), never the dead `player-card`/`animated-card`
  components — see `docs/superpowers/specs/2026-07-19-game-feel-polish-design.md`.
- No visual change may reveal another player's role to anyone but that player. Role-based color
  only ever applies to (a) the acting player's own night-turn selection UI, and (b) that player's
  own `identity-grimoire-card`.
- No new HTTP requests / external assets at runtime — the three sourced SVGs are inlined into the
  Angular template, exactly like `home.component.html`'s existing moon/wolf/village backdrop.
- All three sourced SVGs are CC0/public domain (Openclipart: `/detail/287842`, `/detail/85309`,
  `/detail/321275`) — no attribution required, safe to inline verbatim.
- `prefers-reduced-motion: reduce` must continue to disable new animations (extend the existing
  block in `src/styles/abstracts/_animations.scss`, don't bypass it).
- Follow existing code style: 4-space indent, single quotes, no semicolon changes beyond what
  Prettier's pre-commit hook already enforces (it runs automatically on commit).

---

## Task 1: `role-accent` utility

**Files:**

- Create: `src/app/core/utils/role-accent.util.ts`
- Test: `src/app/core/utils/role-accent.util.spec.ts`

**Interfaces:**

- Consumes: `Role` type from `src/app/core/models/role.model.ts` (already exists: `'Villager' |
'Werewolf' | 'Seer' | 'Doctor' | 'Hunter' | 'Witch' | 'Cupid' | 'Tanner'`).
- Produces: `ROLE_ACCENT: Record<Role, string>`, `roleAccent(role: Role | null): string | null` —
  consumed by Task 8 (`RoomShell`) and Task 10 (`IdentityGrimoireCard`).

- [ ] **Step 1: Write the failing test**

```ts
// src/app/core/utils/role-accent.util.spec.ts
import { roleAccent, ROLE_ACCENT } from './role-accent.util';
import { Role } from '../models/role.model';

describe('roleAccent', () => {
    it('returns null when there is no role', () => {
        expect(roleAccent(null)).toBeNull();
    });

    it('returns the werewolf blood-red accent', () => {
        expect(roleAccent('Werewolf')).toBe('#8f1c2e');
    });

    it('has a valid hex accent for every role', () => {
        const roles: Role[] = [
            'Villager',
            'Werewolf',
            'Seer',
            'Doctor',
            'Hunter',
            'Witch',
            'Cupid',
            'Tanner'
        ];
        for (const role of roles) {
            expect(ROLE_ACCENT[role]).toMatch(/^#[0-9a-f]{6}$/);
            expect(roleAccent(role)).toBe(ROLE_ACCENT[role]);
        }
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --include='**/role-accent.util.spec.ts' --watch=false`
Expected: FAIL — `Cannot find module './role-accent.util'`

- [ ] **Step 3: Write the implementation**

```ts
// src/app/core/utils/role-accent.util.ts
import { Role } from '../models/role.model';

/**
 * Faction accent colors, one per role. Values match the classic-theme --color-faction-* custom
 * properties already defined in src/styles/abstracts/_design-tokens.scss -- kept as plain hex
 * here (rather than var() references) because RoomShell and IdentityGrimoireCard render inside
 * their own local --primary/--accent-day/--accent-night token set, not that global palette.
 */
export const ROLE_ACCENT: Record<Role, string> = {
    Villager: '#c7d3e6',
    Werewolf: '#8f1c2e',
    Seer: '#5aa9a3',
    Doctor: '#6f9e5e',
    Witch: '#7a5ea8',
    Cupid: '#c2679a',
    Hunter: '#b06a2e',
    Tanner: '#9aa332'
};

export function roleAccent(role: Role | null): string | null {
    return role ? ROLE_ACCENT[role] : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --include='**/role-accent.util.spec.ts' --watch=false`
Expected: PASS (3 specs)

- [ ] **Step 5: Commit**

```bash
git add src/app/core/utils/role-accent.util.ts src/app/core/utils/role-accent.util.spec.ts
git commit -m "Add role-accent utility mapping each role to a faction color"
```

---

## Task 2: `phase-family` utility

**Files:**

- Create: `src/app/core/utils/phase-family.util.ts`
- Test: `src/app/core/utils/phase-family.util.spec.ts`

**Interfaces:**

- Consumes: `GameView` type exported from `src/app/core/services/game-state.service.ts` (already
  exists: `'lobby' | 'role-reveal' | 'night' | 'day-discussion' | 'voting' | 'hunter-revenge' |
'game-over'`).
- Produces: `PhaseFamily` type, `phaseFamily(view: GameView): PhaseFamily`,
  `shouldShowPhaseTransition(prev: GameView | null, next: GameView): boolean` — consumed by
  Task 7 (`RoomShell`'s phase-transition wiring).

- [ ] **Step 1: Write the failing test**

```ts
// src/app/core/utils/phase-family.util.spec.ts
import { phaseFamily, shouldShowPhaseTransition } from './phase-family.util';

describe('phaseFamily', () => {
    it('groups role-reveal and night into the same family', () => {
        expect(phaseFamily('role-reveal')).toBe(phaseFamily('night'));
    });

    it('groups day-discussion and voting into the same family', () => {
        expect(phaseFamily('day-discussion')).toBe(phaseFamily('voting'));
    });

    it('keeps night and day in different families', () => {
        expect(phaseFamily('night')).not.toBe(phaseFamily('day-discussion'));
    });

    it('keeps hunter-revenge in its own family', () => {
        expect(phaseFamily('hunter-revenge')).not.toBe(phaseFamily('night'));
        expect(phaseFamily('hunter-revenge')).not.toBe(phaseFamily('day-discussion'));
    });
});

describe('shouldShowPhaseTransition', () => {
    it('never fires on initial mount (no previous view)', () => {
        expect(shouldShowPhaseTransition(null, 'lobby')).toBe(false);
    });

    it('does not fire within the same family', () => {
        expect(shouldShowPhaseTransition('day-discussion', 'voting')).toBe(false);
    });

    it('fires when night turns to day', () => {
        expect(shouldShowPhaseTransition('night', 'day-discussion')).toBe(true);
    });

    it('fires entering and leaving hunter-revenge', () => {
        expect(shouldShowPhaseTransition('day-discussion', 'hunter-revenge')).toBe(true);
        expect(shouldShowPhaseTransition('hunter-revenge', 'night')).toBe(true);
    });

    it('fires when the game ends', () => {
        expect(shouldShowPhaseTransition('voting', 'game-over')).toBe(true);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --include='**/phase-family.util.spec.ts' --watch=false`
Expected: FAIL — `Cannot find module './phase-family.util'`

- [ ] **Step 3: Write the implementation**

```ts
// src/app/core/utils/phase-family.util.ts
import { GameView } from '../services/game-state.service';

export type PhaseFamily = 'lobby' | 'night' | 'day' | 'hunter-revenge' | 'game-over';

const FAMILY: Record<GameView, PhaseFamily> = {
    lobby: 'lobby',
    'role-reveal': 'night',
    night: 'night',
    'day-discussion': 'day',
    voting: 'day',
    'hunter-revenge': 'hunter-revenge',
    'game-over': 'game-over'
};

export function phaseFamily(view: GameView): PhaseFamily {
    return FAMILY[view];
}

/**
 * Whether crossing from `prev` to `next` should fire the full-screen phase-transition overlay --
 * only on a family change (day -> night), not sub-view churn within the same family
 * (day-discussion -> voting stays "day"). `prev === null` is the initial mount, which never fires
 * the overlay since there's nothing to transition *from* yet.
 */
export function shouldShowPhaseTransition(prev: GameView | null, next: GameView): boolean {
    if (prev === null) {
        return false;
    }
    return phaseFamily(prev) !== phaseFamily(next);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --include='**/phase-family.util.spec.ts' --watch=false`
Expected: PASS (8 specs)

- [ ] **Step 5: Commit**

```bash
git add src/app/core/utils/phase-family.util.ts src/app/core/utils/phase-family.util.spec.ts
git commit -m "Add phase-family utility to detect night/day transition boundaries"
```

---

## Task 3: `moon-phase` utility

**Files:**

- Create: `src/app/core/utils/moon-phase.util.ts`
- Test: `src/app/core/utils/moon-phase.util.spec.ts`

**Interfaces:**

- Consumes: nothing (pure function of a number).
- Produces: `MoonPhase` type (`'crescent' | 'firstQuarter' | 'gibbous' | 'full' | 'waning'`),
  `moonPhaseFor(nightNumber: number | null | undefined): MoonPhase` — consumed by Task 7
  (`PhaseTransition`).

- [ ] **Step 1: Write the failing test**

```ts
// src/app/core/utils/moon-phase.util.spec.ts
import { moonPhaseFor } from './moon-phase.util';

describe('moonPhaseFor', () => {
    it('defaults to crescent when the night number is unknown', () => {
        expect(moonPhaseFor(undefined)).toBe('crescent');
        expect(moonPhaseFor(null)).toBe('crescent');
        expect(moonPhaseFor(0)).toBe('crescent');
    });

    it('advances through the cycle with the night number', () => {
        expect(moonPhaseFor(1)).toBe('crescent');
        expect(moonPhaseFor(2)).toBe('firstQuarter');
        expect(moonPhaseFor(3)).toBe('gibbous');
        expect(moonPhaseFor(4)).toBe('full');
        expect(moonPhaseFor(5)).toBe('waning');
    });

    it('wraps back to crescent after a full 5-night cycle', () => {
        expect(moonPhaseFor(6)).toBe('crescent');
        expect(moonPhaseFor(11)).toBe('crescent');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --include='**/moon-phase.util.spec.ts' --watch=false`
Expected: FAIL — `Cannot find module './moon-phase.util'`

- [ ] **Step 3: Write the implementation**

```ts
// src/app/core/utils/moon-phase.util.ts
export type MoonPhase = 'crescent' | 'firstQuarter' | 'gibbous' | 'full' | 'waning';

const CYCLE: readonly MoonPhase[] = ['crescent', 'firstQuarter', 'gibbous', 'full', 'waning'];

/**
 * Cosmetic-only: cycles the phase-transition overlay's moon disc through a waxing-to-full-to-
 * waning sequence keyed off the in-game night number, so it doubles as a "which night is this"
 * cue without being load-bearing game state -- nightNumber (from GameStateResponse) stays the
 * source of truth; this is purely derived. Falls back to the first phase for an unknown/zero
 * night number rather than throwing, so a transition fired before nightNumber is known (e.g.
 * lobby -> role-reveal) still renders something.
 */
export function moonPhaseFor(nightNumber: number | null | undefined): MoonPhase {
    if (!nightNumber || nightNumber < 1) {
        return CYCLE[0];
    }
    return CYCLE[(nightNumber - 1) % CYCLE.length];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --include='**/moon-phase.util.spec.ts' --watch=false`
Expected: PASS (3 specs)

- [ ] **Step 5: Commit**

```bash
git add src/app/core/utils/moon-phase.util.ts src/app/core/utils/moon-phase.util.spec.ts
git commit -m "Add moon-phase utility cycling a cosmetic phase with the night number"
```

---

## Task 4: `death-diff` utility

**Files:**

- Create: `src/app/core/utils/death-diff.util.ts`
- Test: `src/app/core/utils/death-diff.util.spec.ts`

**Interfaces:**

- Consumes: nothing (pure function over plain objects).
- Produces: `AliveFlag` interface (`{ playerId: string; isAlive: boolean }`),
  `diffNewlyDead(prev: readonly AliveFlag[] | null, next: readonly AliveFlag[]): Set<string>` —
  consumed by Task 9 (`RoomShell`'s death-sequencing effect).

- [ ] **Step 1: Write the failing test**

```ts
// src/app/core/utils/death-diff.util.spec.ts
import { diffNewlyDead } from './death-diff.util';

describe('diffNewlyDead', () => {
    it('reports nothing on the first snapshot (prev is null)', () => {
        expect(diffNewlyDead(null, [{ playerId: 'a', isAlive: false }])).toEqual(new Set());
    });

    it('reports a player who flipped from alive to dead', () => {
        const prev = [
            { playerId: 'a', isAlive: true },
            { playerId: 'b', isAlive: true }
        ];
        const next = [
            { playerId: 'a', isAlive: false },
            { playerId: 'b', isAlive: true }
        ];
        expect(diffNewlyDead(prev, next)).toEqual(new Set(['a']));
    });

    it('does not re-report a player who was already dead', () => {
        const prev = [{ playerId: 'a', isAlive: false }];
        const next = [{ playerId: 'a', isAlive: false }];
        expect(diffNewlyDead(prev, next)).toEqual(new Set());
    });

    it('reports multiple simultaneous deaths (e.g. a night kill + a hunter shot)', () => {
        const prev = [
            { playerId: 'a', isAlive: true },
            { playerId: 'b', isAlive: true }
        ];
        const next = [
            { playerId: 'a', isAlive: false },
            { playerId: 'b', isAlive: false }
        ];
        expect(diffNewlyDead(prev, next)).toEqual(new Set(['a', 'b']));
    });

    it('ignores a player present in next but absent from prev', () => {
        const prev: { playerId: string; isAlive: boolean }[] = [];
        const next = [{ playerId: 'a', isAlive: false }];
        expect(diffNewlyDead(prev, next)).toEqual(new Set());
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --include='**/death-diff.util.spec.ts' --watch=false`
Expected: FAIL — `Cannot find module './death-diff.util'`

- [ ] **Step 3: Write the implementation**

```ts
// src/app/core/utils/death-diff.util.ts
export interface AliveFlag {
    playerId: string;
    isAlive: boolean;
}

/**
 * Diffs two alive-flag snapshots and returns the IDs that flipped alive -> dead between them --
 * drives a transient "dying" animation class instead of PlayerGrid entries cutting straight to
 * the static dead style the instant GameStateService's resync lands. `prev === null` (no earlier
 * snapshot for this game yet -- first render, or a fresh mount after a reconnect) never reports a
 * death: without this guard, every player already dead before this client connected would be
 * misreported as "just died" and replay the death animation on page load.
 */
export function diffNewlyDead(
    prev: readonly AliveFlag[] | null,
    next: readonly AliveFlag[]
): Set<string> {
    const result = new Set<string>();
    if (!prev) {
        return result;
    }
    const prevAlive = new Map(prev.map((p) => [p.playerId, p.isAlive]));
    for (const player of next) {
        if (prevAlive.get(player.playerId) === true && !player.isAlive) {
            result.add(player.playerId);
        }
    }
    return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --include='**/death-diff.util.spec.ts' --watch=false`
Expected: PASS (5 specs)

- [ ] **Step 5: Commit**

```bash
git add src/app/core/utils/death-diff.util.ts src/app/core/utils/death-diff.util.spec.ts
git commit -m "Add death-diff utility to detect players who just died between state snapshots"
```

---

## Task 5: `RoomBackdrop` component (horror-themed background assets)

**Files:**

- Create: `src/app/shared/components/room-backdrop/room-backdrop.ts`
- Create: `src/app/shared/components/room-backdrop/room-backdrop.html`
- Create: `src/app/shared/components/room-backdrop/room-backdrop.scss`

**Source assets (already downloaded and cleaned this session):**

- `C:\cygwin64\tmp\claude\C--Users-CCDT-source-werewolf-frontend\ca9acdc1-efa3-4b20-8a2d-8af699235f4f\scratchpad\svg\house-clean.svg`
- `C:\cygwin64\tmp\claude\C--Users-CCDT-source-werewolf-frontend\ca9acdc1-efa3-4b20-8a2d-8af699235f4f\scratchpad\svg\graveyard-clean.svg`
- `C:\cygwin64\tmp\claude\C--Users-CCDT-source-werewolf-frontend\ca9acdc1-efa3-4b20-8a2d-8af699235f4f\scratchpad\svg\wolf-clean.svg`

Each is already stripped of Inkscape/RDF/sodipodi cruft, has a `viewBox`, no explicit
`width`/`height` on the root `<svg>`, and every `fill` recolored to either `currentColor` (body)
or `var(--glow, currentColor)` (window/moon highlight details). Verified by rendering: haunted
house shows gold-lit windows, graveyard shows a small glowing cross-moon accent, wolf is a clean
single-tone silhouette. CC0/public domain, no attribution needed (Openclipart 287842, 85309,
321275).

**Interfaces:**

- Consumes: nothing external.
- Produces: `<app-room-backdrop [isNight]="boolean">` — consumed by Task 6 (`RoomShell`).

- [ ] **Step 1: Create the component class**

```ts
// src/app/shared/components/room-backdrop/room-backdrop.ts
import { Component, input } from '@angular/core';

/**
 * Purely decorative, aria-hidden backdrop for the room screen: a haunted-house + graveyard
 * silhouette that's always present (the game's "village" setting), plus a howling-wolf silhouette
 * that only shows during night phases -- so it reads as a phase differentiator, not static
 * decoration. All three SVGs are CC0/public-domain Openclipart silhouettes (see
 * docs/superpowers/specs/2026-07-19-game-feel-polish-design.md for source URLs), recolored to
 * currentColor/var(--glow) so they theme with the rest of the shell, including the 'bloody' theme
 * swap.
 */
@Component({
    selector: 'app-room-backdrop',
    imports: [],
    templateUrl: './room-backdrop.html',
    styleUrl: './room-backdrop.scss'
})
export class RoomBackdrop {
    readonly isNight = input(false);
}
```

- [ ] **Step 2: Build the template**

Read the three cleaned SVG files listed above and paste each one's full contents (the whole
`<svg viewBox="..." ...>...</svg>` element, unmodified) into the matching wrapper `<div>` below,
replacing the `<!-- paste ... -->` comments:

```html
<!-- src/app/shared/components/room-backdrop/room-backdrop.html -->
<div class="room-backdrop" aria-hidden="true">
    <div class="room-backdrop__house">
        <!-- paste house-clean.svg contents here -->
    </div>
    <div class="room-backdrop__graveyard">
        <!-- paste graveyard-clean.svg contents here -->
    </div>
    <div class="room-backdrop__wolf" [class.room-backdrop__wolf--visible]="isNight()">
        <!-- paste wolf-clean.svg contents here -->
    </div>
</div>
```

- [ ] **Step 3: Style it**

```scss
// src/app/shared/components/room-backdrop/room-backdrop.scss
.room-backdrop {
    position: absolute;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;

    svg {
        display: block;
        width: 100%;
        height: auto;
    }

    &__house {
        position: absolute;
        bottom: 0;
        left: 2%;
        width: 14rem;
        max-width: 22vw;
        color: var(--bg-nested);
        --glow: var(--accent-day);
        opacity: 0.5;
    }

    &__graveyard {
        position: absolute;
        bottom: 0;
        right: 4%;
        width: 20rem;
        max-width: 32vw;
        color: var(--bg-nested);
        --glow: var(--accent-night);
        opacity: 0.35;
    }

    &__wolf {
        position: absolute;
        bottom: 0;
        left: 50%;
        width: 26rem;
        max-width: 40vw;
        transform: translateX(-50%);
        color: var(--accent-night);
        opacity: 0;
        transition: opacity 1.2s ease;

        &--visible {
            opacity: 0.22;
        }
    }
}

@media (prefers-reduced-motion: reduce) {
    .room-backdrop__wolf {
        transition: none;
    }
}
```

- [ ] **Step 4: Verify it builds**

Run: `npm run build`
Expected: build succeeds with no new errors (this component isn't mounted anywhere yet, so this
only checks it compiles standalone).

- [ ] **Step 5: Commit**

```bash
git add src/app/shared/components/room-backdrop/
git commit -m "Add RoomBackdrop component with CC0 haunted-house/graveyard/wolf silhouettes"
```

---

## Task 6: Mount `RoomBackdrop` in `RoomShell`

**Files:**

- Modify: `src/app/shared/components/room-shell/room-shell.ts`
- Modify: `src/app/shared/components/room-shell/room-shell.html`
- Modify: `src/app/shared/components/room-shell/room-shell.scss`

**Interfaces:**

- Consumes: `RoomBackdrop` from Task 5, `isNight` computed already on `RoomShell`
  (`room-shell.ts:135`).

- [ ] **Step 1: Import and register the component**

In `src/app/shared/components/room-shell/room-shell.ts`, add the import near the other shared
component imports:

```ts
import { RoomBackdrop } from '../room-backdrop/room-backdrop';
```

Add `RoomBackdrop` to the `@Component` `imports` array (currently: `FormsModule, TranslatePipe,
IdentityGrimoireCard, PhaseBanner, PlayerGrid, RoomActionPanel, SettingsModal, LanguageSwitch`) —
append `RoomBackdrop` to that list.

- [ ] **Step 2: Mount it in the template**

In `src/app/shared/components/room-shell/room-shell.html`, add it as the first child inside the
root div, before `<header class="room-shell__header">`:

```html
<div class="room-shell" [attr.data-phase]="isNight() ? 'night' : 'day'">
    <app-room-backdrop [isNight]="isNight()"></app-room-backdrop>
    <header class="room-shell__header"></header>
</div>
```

- [ ] **Step 3: Fix stacking order**

In `src/app/shared/components/room-shell/room-shell.scss`, the root `.room-shell` rule currently
has no `position` set. Add `position: relative;` right after `display: flex;` (needed so the
backdrop's `position: absolute; inset: 0;` is contained). Then give `&__viewport` an explicit
stacking context above the backdrop's `z-index: 0` — this mirrors the exact pattern
`home.component.scss` already uses for its own backdrop (`.home-dashboard { position: relative;
z-index: 1; }`):

```scss
    &__viewport {
        position: relative;
        z-index: 1;
        flex: 1;
```

(That's the existing `&__viewport` block at `room-shell.scss:142` — add the two new lines as the
first two declarations inside it.) `&__header` already has `position: sticky; z-index: 10;`, so it
needs no change.

- [ ] **Step 4: Manual verification**

With the backend (`dotnet run` in `werewolf/src/Application`) and frontend (`npm start`) both
running, open a room and confirm: the haunted house (bottom-left) and graveyard (bottom-right)
are faintly visible behind the header/viewport content, at low opacity, not overlapping or
obscuring any interactive element. Toggle into Night phase (via a real game) and confirm the wolf
silhouette fades in behind the player grid.

- [ ] **Step 5: Commit**

```bash
git add src/app/shared/components/room-shell/
git commit -m "Mount RoomBackdrop in RoomShell with correct stacking order"
```

---

## Task 7: Rewire `PhaseTransition` onto live tokens with a moon-phase disc, and mount it

**Files:**

- Modify: `src/app/shared/components/phase-transition/phase-transition.ts`
- Modify: `src/app/shared/components/phase-transition/phase-transition.html`
- Modify: `src/app/shared/components/phase-transition/phase-transition.scss`
- Modify: `src/app/shared/components/room-shell/room-shell.ts`
- Modify: `src/app/shared/components/room-shell/room-shell.html`

**Interfaces:**

- Consumes: `moonPhaseFor` from Task 3, `shouldShowPhaseTransition` from Task 2.
- Produces: `<app-phase-transition [title] [nightNumber] (dismissed)>` — a working, mounted
  overlay.

- [ ] **Step 1: Add a `nightNumber` input and moon-phase computed to `PhaseTransition`**

```ts
// src/app/shared/components/phase-transition/phase-transition.ts
import { Component, computed, input, output } from '@angular/core';
import { moonPhaseFor } from '../../../core/utils/moon-phase.util';

@Component({
    selector: 'app-phase-transition',
    imports: [],
    templateUrl: './phase-transition.html',
    styleUrl: './phase-transition.scss'
})
export class PhaseTransition {
    readonly title = input.required<string>();
    readonly nightNumber = input<number | null>(null);
    readonly durationMs = input(1400);

    readonly dismissed = output<void>();

    readonly moonPhase = computed(() => moonPhaseFor(this.nightNumber()));

    onAnimationEnd(): void {
        this.dismissed.emit();
    }
}
```

- [ ] **Step 2: Add the moon disc to the template**

```html
<!-- src/app/shared/components/phase-transition/phase-transition.html -->
<div class="phase-transition" (animationend)="onAnimationEnd()">
    <div class="phase-transition__disc" [class]="'phase-transition__disc--' + moonPhase()"></div>
    <h2 class="phase-title phase-transition__title">{{ title() }}</h2>
</div>
```

- [ ] **Step 3: Port the styles onto live tokens and draw the moon phases in CSS**

```scss
// src/app/shared/components/phase-transition/phase-transition.scss
.phase-transition {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background-color: var(--bg-main, #0a0d16);
    animation: phaseIris 1.4s ease-in-out forwards;

    &__disc {
        position: relative;
        width: 8rem;
        height: 8rem;
        margin-bottom: 1.5rem;
        border-radius: 999px;
        background: var(--primary, #d9a441);
        box-shadow: 0 0 60px 10px color-mix(in srgb, var(--primary, #d9a441) 55%, transparent);
        overflow: hidden;

        &::after {
            content: '';
            position: absolute;
            inset: 0;
            border-radius: 999px;
            background: var(--bg-main, #0a0d16);
            transform: translateX(var(--shadow-x, 130%));
        }

        &--crescent {
            --shadow-x: 25%;
        }

        &--firstQuarter {
            --shadow-x: 55%;
        }

        &--gibbous {
            --shadow-x: 85%;
        }

        &--full {
            --shadow-x: 130%;
        }

        &--waning {
            --shadow-x: -10%;
        }
    }

    &__title {
        color: var(--primary, #d9a441);
        text-transform: uppercase;
        letter-spacing: 0.15em;
    }
}
```

- [ ] **Step 4: Wire it into `RoomShell`**

In `src/app/shared/components/room-shell/room-shell.ts`, add imports:

```ts
import { PhaseTransition } from '../phase-transition/phase-transition';
import { shouldShowPhaseTransition } from '../../../core/utils/phase-family.util';
```

Add `PhaseTransition` to the `@Component` `imports` array.

Add a new signal near the other view-related signals (after `readonly showSettings =
signal(false);`):

```ts
    readonly showPhaseTransition = signal(false);
```

In the constructor, extend the existing view-tracking effect (`room-shell.ts:481-489`, currently:

```ts
let lastAnnouncedView: GameView | null = null;
effect(() => {
    const view = this.view();
    const key = PHASE_ANNOUNCEMENT_KEY[view];
    if (key && view !== lastAnnouncedView) {
        this.appendSystemMessage(this.translate.instant(key));
    }
    lastAnnouncedView = view;
});
```

) so it also drives the transition overlay, using the same `lastAnnouncedView` tracking variable
rather than adding a second one:

```ts
let lastAnnouncedView: GameView | null = null;
effect(() => {
    const view = this.view();
    if (shouldShowPhaseTransition(lastAnnouncedView, view)) {
        this.showPhaseTransition.set(true);
    }
    const key = PHASE_ANNOUNCEMENT_KEY[view];
    if (key && view !== lastAnnouncedView) {
        this.appendSystemMessage(this.translate.instant(key));
    }
    lastAnnouncedView = view;
});
```

- [ ] **Step 5: Mount the overlay in the template**

In `src/app/shared/components/room-shell/room-shell.html`, add right after the root div's opening
tag (before `<app-room-backdrop>` from Task 6, so it paints on top of everything including the
header while active):

```html
<div class="room-shell" [attr.data-phase]="isNight() ? 'night' : 'day'">
    @if (showPhaseTransition()) {
    <app-phase-transition
        [title]="bannerStatus()"
        [nightNumber]="state()?.nightNumber ?? null"
        (dismissed)="showPhaseTransition.set(false)"
    ></app-phase-transition>
    }
    <app-room-backdrop [isNight]="isNight()"></app-room-backdrop>
    <header class="room-shell__header"></header>
</div>
```

- [ ] **Step 6: Manual verification**

Play through a full game (backend + frontend running). Confirm the iris-wipe overlay with the
moon disc appears when: the lobby starts (→ role-reveal), night turns to day-discussion, day
turns to voting→...→night again, and at game-over. Confirm it does **not** fire between
day-discussion and voting (same family). Confirm the moon disc's lit/shadow split visibly changes
shape between Night 1, 2, and 3.

- [ ] **Step 7: Commit**

```bash
git add src/app/shared/components/phase-transition/ src/app/shared/components/room-shell/
git commit -m "Wire up PhaseTransition on live tokens with a moon-phase disc"
```

---

## Task 8: Per-role night-action accent color

**Files:**

- Modify: `src/app/shared/components/room-shell/room-shell.ts`
- Modify: `src/app/shared/components/room-shell/room-shell.html`
- Modify: `src/app/shared/components/player-grid/player-grid.scss`

**Interfaces:**

- Consumes: `roleAccent` from Task 1, `showWerewolf`/`showDoctor`/`showSeer`/`showCupid`/
  `showWitch` computeds already on `RoomShell` (`room-shell.ts:187-210`).
- Produces: `nightActionAccent` computed on `RoomShell`, `--action-accent` CSS custom property
  consumed by `player-grid.scss`.

- [ ] **Step 1: Add the computed accent to `RoomShell`**

In `src/app/shared/components/room-shell/room-shell.ts`, add the import:

```ts
import { roleAccent } from '../../../core/utils/role-accent.util';
```

Add a new computed near `werewolfTallyDisplay` (after the `showWitch` computed at
`room-shell.ts:210`):

```ts
    /** Colors the acting player's own selectable/selected grid cards to match their current
     * night role instead of the generic day/night --primary -- werewolf glows blood-red, doctor
     * green, etc. Only affects the acting player's own screen during their own turn; other
     * players' grids never read this (their showX() computeds are all false), so it can't leak
     * role information. */
    readonly nightActionAccent = computed<string | null>(() => {
        if (this.showWerewolf()) {
            return roleAccent('Werewolf');
        }
        if (this.showDoctor()) {
            return roleAccent('Doctor');
        }
        if (this.showSeer()) {
            return roleAccent('Seer');
        }
        if (this.showCupid()) {
            return roleAccent('Cupid');
        }
        if (this.showWitch()) {
            return roleAccent('Witch');
        }
        return null;
    });
```

- [ ] **Step 2: Bind it as a CSS custom property**

In `src/app/shared/components/room-shell/room-shell.html`, add the style binding to the root div
alongside the existing `[attr.data-phase]`:

```html
<div
    class="room-shell"
    [attr.data-phase]="isNight() ? 'night' : 'day'"
    [style.--action-accent]="nightActionAccent()"
></div>
```

- [ ] **Step 3: Consume it in `player-grid.scss`**

In `src/app/shared/components/player-grid/player-grid.scss`, change the `&--selected` and
`&--suspected` rules (currently at `player-grid.scss:21-32`) from:

```scss
&--selected {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 8%, transparent);
}

// Flags a player who already has at least one accusation against them, independent of
// who *I've* selected to vote for (that's &--selected above) -- matches the mockup's
// highlighted border on already-suspected players during Day Voting.
&--suspected {
    border-color: color-mix(in srgb, var(--primary) 60%, transparent);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary) 30%, transparent);
}
```

to:

```scss
// var(--action-accent, var(--primary)) falls back to the generic day/night --primary
// outside a night role's turn (voting, hunter-revenge, lobby kick) since RoomShell only
// sets --action-accent while a night sub-phase is showing.
&--selected {
    border-color: var(--action-accent, var(--primary));
    background: color-mix(in srgb, var(--action-accent, var(--primary)) 8%, transparent);
}

// Flags a player who already has at least one accusation against them, independent of
// who *I've* selected to vote for (that's &--selected above) -- matches the mockup's
// highlighted border on already-suspected players during Day Voting.
&--suspected {
    border-color: color-mix(in srgb, var(--action-accent, var(--primary)) 60%, transparent);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--action-accent, var(--primary)) 30%, transparent);
}
```

- [ ] **Step 4: Manual verification**

Play through a night phase as a werewolf and confirm the target you select glows blood-red
instead of the generic amber/purple. Repeat as doctor (green) and seer (teal) if feasible in the
same test game. Confirm Day Voting's selected/suspected borders are unchanged (still the day
accent), since `nightActionAccent()` is `null` outside a night turn.

- [ ] **Step 5: Commit**

```bash
git add src/app/shared/components/room-shell/ src/app/shared/components/player-grid/player-grid.scss
git commit -m "Color night-action selection by role instead of generic day/night accent"
```

---

## Task 9: Sequenced death reveal

**Files:**

- Modify: `src/app/shared/components/room-shell/room-shell.ts`
- Modify: `src/app/shared/components/player-grid/player-grid.ts`
- Modify: `src/app/shared/components/player-grid/player-grid.html`
- Modify: `src/app/shared/components/player-grid/player-grid.scss`
- Modify: `src/styles/abstracts/_animations.scss`

**Interfaces:**

- Consumes: `diffNewlyDead`/`AliveFlag` from Task 4.
- Produces: `dying?: boolean` field on `PlayerGridEntry`.

- [ ] **Step 1: Add the `dying` field to `PlayerGridEntry`**

In `src/app/shared/components/player-grid/player-grid.ts`, add one field to the interface
(currently ending at `revealedRole?: Role;`, `player-grid.ts:25`):

```ts
    revealedRole?: Role;
    dying?: boolean;
}
```

- [ ] **Step 2: Render the class in the template**

In `src/app/shared/components/player-grid/player-grid.html`, add the class binding alongside the
existing ones on `.player-grid__card` (currently 3 `[class.*]` bindings at
`player-grid.html:5-7`):

```html
<div
    class="player-grid__card"
    [class.player-grid__card--dead]="!entry.isAlive"
    [class.player-grid__card--dying]="entry.dying"
    [class.player-grid__card--selected]="entry.selected"
    [class.player-grid__card--suspected]="!entry.selected && (entry.voteCount ?? 0) > 0"
></div>
```

- [ ] **Step 3: Add the dying animation**

In `src/app/shared/components/player-grid/player-grid.scss`, add a new modifier next to `&--dead`
(currently at `player-grid.scss:34-37`):

```scss
// Resurrects the cardDeath keyframe (src/styles/abstracts/_animations.scss) -- it's been
// sitting unused since the player-card component it was written for was replaced by this
// grid. Plays once when a player flips alive -> dead (see RoomShell's dyingIds signal),
// then --dead's static grayscale/opacity takes over for the rest of the game.
&--dying {
    animation: cardDeath 0.9s ease-out forwards;
}

&--dead {
    opacity: 0.45;
    background: color-mix(in srgb, var(--bg-main) 30%, transparent);
}
```

- [ ] **Step 4: Extend the reduced-motion guard**

In `src/styles/abstracts/_animations.scss`, the existing `prefers-reduced-motion` block (currently
`_animations.scss:95-102`):

```scss
@media (prefers-reduced-motion: reduce) {
    .animated-card,
    .player-card,
    .phase-transition {
        animation: none !important;
        transition: opacity 0.01ms !important;
    }
}
```

Add `.player-grid__card` to the selector list:

```scss
@media (prefers-reduced-motion: reduce) {
    .animated-card,
    .player-card,
    .player-grid__card,
    .phase-transition {
        animation: none !important;
        transition: opacity 0.01ms !important;
    }
}
```

- [ ] **Step 5: Track newly-dead players in `RoomShell` and expose `dying` on grid entries**

In `src/app/shared/components/room-shell/room-shell.ts`, add the import:

```ts
import { AliveFlag, diffNewlyDead } from '../../../core/utils/death-diff.util';
```

Add a new signal near `wolfLockedTarget` (after the night-phase local state block,
`room-shell.ts:105-114`):

```ts
    readonly dyingIds = signal<Set<string>>(new Set());
```

In the constructor, add a new effect (after the existing night-number-reset effect,
`room-shell.ts:510-520`):

```ts
let previousAlive: AliveFlag[] | null = null;
const dyingTimeouts: ReturnType<typeof setTimeout>[] = [];
effect(() => {
    const state = this.state();
    const nextAlive: AliveFlag[] = state
        ? state.players.map((p) => ({ playerId: p.playerId, isAlive: p.isAlive }))
        : [];
    const newlyDead = diffNewlyDead(previousAlive, nextAlive);
    previousAlive = nextAlive;
    if (newlyDead.size === 0) {
        return;
    }
    this.dyingIds.update((current) => new Set([...current, ...newlyDead]));
    dyingTimeouts.push(
        setTimeout(() => {
            this.dyingIds.update((current) => {
                const next = new Set(current);
                for (const id of newlyDead) {
                    next.delete(id);
                }
                return next;
            });
        }, 900)
    );
});
inject(DestroyRef).onDestroy(() => dyingTimeouts.forEach(clearTimeout));
```

In the `entries()` computed, add `dying: this.dyingIds().has(p.playerId)` to the object literal
returned for each player in the four branches that map over `state.players`/`alive`: the
`game-over` branch (`room-shell.ts:377-384`), the `voting` branch's `alive.map` (inside
`room-shell.ts:390-400`), the `hunter-revenge` branch (`room-shell.ts:419-430`), and the final
`state.players.map` branch (`room-shell.ts:434-477`). For example, the `game-over` branch changes
from:

```ts
return state.players.map((p) => ({
    playerId: p.playerId,
    displayName: displayName(p.playerId),
    isAlive: p.isAlive,
    isMe: p.playerId === myId,
    isHost: p.playerId === lobby?.hostPlayerId,
    revealedRole: roles[p.playerId]
}));
```

to:

```ts
return state.players.map((p) => ({
    playerId: p.playerId,
    displayName: displayName(p.playerId),
    isAlive: p.isAlive,
    isMe: p.playerId === myId,
    isHost: p.playerId === lobby?.hostPlayerId,
    revealedRole: roles[p.playerId],
    dying: this.dyingIds().has(p.playerId)
}));
```

Apply the same one-line addition (`dying: this.dyingIds().has(p.playerId)`) to the object literals
in the other three branches.

- [ ] **Step 6: Manual verification**

Play a game to a night kill or day lynch. Confirm the dying player's card visibly plays the
grayscale/rotate death animation for under a second before settling into the static `--dead`
(opacity 0.45) style, instead of cutting straight to it. Reload the page mid-game and confirm
already-dead players do **not** replay the animation on load.

- [ ] **Step 7: Commit**

```bash
git add src/app/shared/components/room-shell/room-shell.ts \
        src/app/shared/components/player-grid/ \
        src/styles/abstracts/_animations.scss
git commit -m "Sequence death reveal with a transient dying animation before the static dead style"
```

---

## Task 10: Own-role identity card accent

**Files:**

- Modify: `src/app/shared/components/identity-grimoire-card/identity-grimoire-card.ts`
- Modify: `src/app/shared/components/identity-grimoire-card/identity-grimoire-card.html`
- Modify: `src/app/shared/components/identity-grimoire-card/identity-grimoire-card.scss`

**Interfaces:**

- Consumes: `roleAccent` from Task 1.

- [ ] **Step 1: Compute the accent**

In `src/app/shared/components/identity-grimoire-card/identity-grimoire-card.ts`, add imports:

```ts
import { Component, computed, inject, input, signal } from '@angular/core';
import { roleAccent } from '../../../core/utils/role-accent.util';
```

(`computed` replaces the current plain `import { Component, inject, input, signal }`.) Add a new
computed after `icon`:

```ts
    readonly accent = computed(() => roleAccent(this.role()));
```

- [ ] **Step 2: Bind it as a CSS custom property**

In `src/app/shared/components/identity-grimoire-card/identity-grimoire-card.html`, add the style
binding to the flip-card wrapper (currently at `identity-grimoire-card.html:4-9`):

```html
<div
    class="identity-grimoire__card"
    [class.identity-grimoire__card--flipped]="flipped()"
    [class.identity-grimoire__card--inert]="!role()"
    [style.--role-accent]="accent()"
    (click)="toggleFlip()"
></div>
```

- [ ] **Step 3: Consume it on the back face only**

In `src/app/shared/components/identity-grimoire-card/identity-grimoire-card.scss`, change the
`&--back` rule (currently at `identity-grimoire-card.scss:79-84`) from:

```scss
&--back {
    transform: rotateY(180deg);
    background: linear-gradient(180deg, #120f24 0%, #181a24 55%, var(--bg-main) 100%);
    border-color: var(--primary);
}
```

to:

```scss
&--back {
    transform: rotateY(180deg);
    background: linear-gradient(180deg, #120f24 0%, #181a24 55%, var(--bg-main) 100%);
    border-color: var(--role-accent, var(--primary));
}
```

Then scope the back face's content colors to the same fallback var, so the front face (which also
renders `&__eyebrow`/`&__hint` for its "LUNARIS" / "tap to inspect" text, and must keep the plain
day/night `--primary` since no role is known yet) is unaffected. Nest the overrides inside
`&--back` — `&__eyebrow` etc. render inside `.identity-grimoire__face--back` in the template, so a
descendant selector scoped to `&--back` matches only there:

```scss
&--back {
    transform: rotateY(180deg);
    background: linear-gradient(180deg, #120f24 0%, #181a24 55%, var(--bg-main) 100%);
    border-color: var(--role-accent, var(--primary));

    .identity-grimoire__eyebrow,
    .identity-grimoire__hint {
        color: var(--role-accent, var(--primary));
    }

    .identity-grimoire__glyph {
        color: var(--role-accent, var(--primary));
        background: color-mix(in srgb, var(--role-accent, var(--primary)) 15%, transparent);
        box-shadow: 0 0 15px color-mix(in srgb, var(--role-accent, var(--primary)) 25%, transparent);
    }

    .identity-grimoire__role-icon {
        color: var(--role-accent, var(--primary));
    }

    .identity-grimoire__role-text h4 {
        color: var(--role-accent, var(--primary));
    }
}
```

Delete the now-redundant `var(--primary)` color declarations from the original standalone
`&__eyebrow`/`&__glyph`/`&__hint`/`&__role-icon`/`&__role-text h4` rules only if they were solely
color (check each: `&__eyebrow` and `&__hint` are color-only — safe to delete entirely now that
`&--back` overrides them, but the **front face also renders `&__eyebrow`** with the literal text
"LUNARIS", and needs to keep the plain `var(--primary)` styling since `--role-accent` is null
before a role exists anyway). Leave the original rules as-is (don't delete them) — the nested
`&--back .identity-grimoire__eyebrow` rule above has higher specificity and simply overrides them
on the back face only, which is exactly the desired behavior with zero risk to the front face.

- [ ] **Step 4: Manual verification**

Join a game as any special role (e.g. Witch) and flip the identity card. Confirm the back face's
border/glow/text tint to that role's color (witch = purple) instead of the plain day/night amber.
Confirm the front (unflipped, pre-reveal) face is unaffected. Confirm a Villager's card still uses
a sensible neutral tint rather than looking broken.

- [ ] **Step 5: Commit**

```bash
git add src/app/shared/components/identity-grimoire-card/
git commit -m "Tint the identity grimoire card's back face by the player's own role"
```

---

## Task 11: Button color semantics fix

**Files:**

- Modify: `src/app/shared/components/room-action-panel/room-action-panel.scss`

**Interfaces:** none (pure CSS).

- [ ] **Step 1: Stop the primary button gradient from blending in danger-red**

In `src/app/shared/components/room-action-panel/room-action-panel.scss`, change the `&--primary`
rule (currently at `room-action-panel.scss:30-34`) from:

```scss
&--primary {
    border: none;
    color: white;
    background: linear-gradient(135deg, var(--accent-day, var(--primary)), var(--danger));
}
```

to:

```scss
// Was gradienting into var(--danger), which made Ready Up / Submit Vote read faintly red
// and diluted red as a "this is destructive" signal for Quit/Cancel Lobby/Leave Lobby/Kick
// (all correctly on --button--danger below). Gold-to-gold instead of gold-to-red.
&--primary {
    border: none;
    color: white;
    background: linear-gradient(
        135deg,
        var(--accent-day, var(--primary)),
        var(--color-gold, #d9a441)
    );
}
```

- [ ] **Step 2: Manual verification**

Open the lobby screen and confirm the "Ready Up" button no longer has a visible red tint in its
gradient, while "Cancel Lobby"/"Leave Lobby" (both `--button--danger`) are still clearly red.

- [ ] **Step 3: Commit**

```bash
git add src/app/shared/components/room-action-panel/room-action-panel.scss
git commit -m "Stop the primary action button gradient from blending in danger-red"
```

---

## Task 12: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full unit test suite**

Run: `npm test -- --watch=false`
Expected: all specs pass, including the 4 new util spec files from Tasks 1-4.

- [ ] **Step 2: Run the full Playwright e2e suite**

With the backend running (`dotnet run` in `werewolf/src/Application`, or `podman compose up -d`
per `e2e/start-backend.cjs`'s existing automation), run:

Run: `npm run e2e`
Expected: all specs in `e2e/*.spec.ts` pass. Pay particular attention to
`in-game-layout.spec.ts` (asserts on `.player-grid__card`, `.room-action-panel`,
`.room-shell__left`/`.room-shell__chat` `position` CSS) and `player-journey.spec.ts` (asserts
`.player-grid__card--selected` class) — neither should be affected since Tasks 6-11 only changed
CSS custom property _values_ those classes consume, not the class names or DOM structure the
tests query.

- [ ] **Step 3: Manual full playthrough**

With both servers running, play one complete game through the browser covering every phase this
plan touches: lobby → role-reveal (phase transition + moon disc) → night as werewolf (blood-red
selection accent, backdrop wolf visible) → a kill resolves (sequenced death animation) → day
discussion → voting → night again (moon phase visibly advanced) → game-over (phase transition,
final role reveal). Confirm no console errors in the browser dev tools during the playthrough.

- [ ] **Step 4: Check `prefers-reduced-motion`**

In the browser dev tools, enable "Emulate CSS media feature prefers-reduced-motion: reduce" and
reload mid-game. Confirm the dying animation and phase-transition iris-wipe no longer animate
(snap instantly instead), per the guard extended in Task 9 Step 4 and the pre-existing
`.phase-transition` entry in that same block.
