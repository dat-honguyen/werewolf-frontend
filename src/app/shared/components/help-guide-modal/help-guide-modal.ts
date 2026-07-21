import { Component, computed, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

interface HelpStep {
    key: string;
    image: string;
}

/** Screenshots of the actual running app (captured via Playwright against a live game, not
 * mockups) -- one per stage a player passes through, in order. See public/help/README.md for how
 * to regenerate them if the UI they show changes enough to look stale. */
const STEPS: HelpStep[] = [
    { key: 'join', image: 'help/01-join.png' },
    { key: 'lobby', image: 'help/02-lobby.png' },
    { key: 'role', image: 'help/03-role.png' },
    { key: 'night', image: 'help/04-night.png' },
    { key: 'day', image: 'help/05-day.png' },
    { key: 'voting', image: 'help/06-voting.png' },
    { key: 'gameOver', image: 'help/07-game-over.png' }
];

/**
 * A short, always-available walkthrough of a full game from the Home screen to Game Over -- what
 * to look at and what to do at each stage. Distinct from RoleGuideModal (which only covers role
 * rules) and SettingsModal (host-only room configuration); this is aimed at a first-time player
 * who's never seen the UI before, so it's reachable both from Home (before joining any room) and
 * from the in-room header.
 */
@Component({
    selector: 'app-help-guide-modal',
    imports: [TranslatePipe],
    templateUrl: './help-guide-modal.html',
    styleUrl: './help-guide-modal.scss'
})
export class HelpGuideModal {
    readonly closed = output<void>();

    readonly steps = STEPS;
    readonly totalSteps = STEPS.length;
    readonly index = signal(0);

    readonly step = computed(() => this.steps[this.index()]);
    readonly isFirst = computed(() => this.index() === 0);
    readonly isLast = computed(() => this.index() === this.totalSteps - 1);

    next(): void {
        if (this.isLast()) {
            this.closed.emit();
            return;
        }
        this.index.update((i) => i + 1);
    }

    prev(): void {
        this.index.update((i) => Math.max(0, i - 1));
    }

    goTo(i: number): void {
        this.index.set(i);
    }
}
