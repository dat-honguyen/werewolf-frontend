import { Component, computed, inject, input, output } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

@Component({
    selector: 'app-death-reveal',
    imports: [TranslatePipe],
    templateUrl: './death-reveal.html',
    styleUrl: './death-reveal.scss'
})
export class DeathReveal {
    private readonly translate = inject(TranslateService);

    /** 'lynch' gets its own dedicated reveal with a reason ("X was lynched"), paused on a
     * "tallying the votes" stage first. Every other cause (night kill, hunter revenge, broken
     * heart, ...) is grouped under 'deaths' -- no reason shown, and more than one name renders
     * together on one screen (see room-shell.ts's death-batching) instead of a separate reveal
     * per player. */
    readonly mode = input.required<'lynch' | 'deaths'>();
    readonly name = input('');
    readonly names = input<readonly string[]>([]);
    readonly stage = input<'tallying' | 'revealed'>('revealed');
    readonly tallyingDurationMs = input(3000);
    readonly revealedDurationMs = input(4000);

    readonly dismissed = output<void>();

    private readonly isTallying = computed(
        () => this.mode() === 'lynch' && this.stage() === 'tallying'
    );

    readonly durationMs = computed(() =>
        this.isTallying() ? this.tallyingDurationMs() : this.revealedDurationMs()
    );

    /** No role is ever shown here (name only) -- deliberate, see the design discussion: a full
     * role reveal would hand out free deduction info the game doesn't otherwise give away. */
    private readonly joinedNames = computed(() => {
        const names = this.names();
        if (names.length <= 1) {
            return names[0] ?? '';
        }
        const and = this.translate.instant('roomShell.deathReveal.and');
        return names.length === 2
            ? `${names[0]} ${and} ${names[1]}`
            : `${names.slice(0, -1).join(', ')}, ${and} ${names[names.length - 1]}`;
    });

    readonly translationKey = computed(() => {
        if (this.isTallying()) {
            return 'roomShell.deathReveal.tallying';
        }
        if (this.mode() === 'lynch') {
            return 'roomShell.deathReveal.lynched';
        }
        return this.names().length > 1
            ? 'roomShell.deathReveal.diedPlural'
            : 'roomShell.deathReveal.died';
    });

    readonly translationParams = computed(() =>
        this.mode() === 'lynch' ? { name: this.name() } : { names: this.joinedNames() }
    );

    onAnimationEnd(): void {
        this.dismissed.emit();
    }
}
