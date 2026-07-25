import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { TranslatePipe } from '@ngx-translate/core';
import { Role } from '../../../core/models/role.model';
import { ROLE_ICON } from '../../../core/utils/role-icon.util';
import { AnimatedCard } from '../animated-card/animated-card';

const FACTION_GLOW: Record<Role, string> = {
    Villager: 'var(--color-faction-villager)',
    Werewolf: 'var(--color-faction-werewolf)',
    Seer: 'var(--color-faction-seer)',
    Doctor: 'var(--color-faction-doctor)',
    Witch: 'var(--color-faction-witch)',
    Cupid: 'var(--color-faction-cupid)',
    Hunter: 'var(--color-faction-hunter)',
    Tanner: 'var(--color-faction-tanner)'
};

@Component({
    selector: 'app-role-card',
    imports: [AnimatedCard, TranslatePipe],
    templateUrl: './role-card.html',
    styleUrl: './role-card.scss'
})
export class RoleCard {
    private readonly sanitizer = inject(DomSanitizer);

    readonly role = input.required<Role>();
    readonly description = input<string>('');
    readonly revealed = input(false);

    /** Stagger delay (ms) before this card's flip animation starts, used only by the Game Over
     * grid (player-grid.html) to cascade several cards' reveals one after another instead of
     * flipping them all in the same instant. 0 everywhere else -- the normal case. */
    readonly revealDelayMs = input(0);

    /** `revealed` flips true the same render this component is first created (player-grid.html's
     * @if only mounts app-role-card once revealedRole is set), so binding animated-card's
     * [flipped] straight to `revealed()` would never actually transition -- the card would just
     * appear already face-up, with no animation to delay in the first place. This signal starts
     * false and is set true `revealDelayMs()` after `revealed()` turns true, so there's a real
     * false-to-true change for the CSS flip transition to animate. */
    readonly revealedDelayed = signal(false);

    constructor() {
        effect((onCleanup) => {
            if (!this.revealed()) {
                this.revealedDelayed.set(false);
                return;
            }
            const timeout = setTimeout(() => this.revealedDelayed.set(true), this.revealDelayMs());
            onCleanup(() => clearTimeout(timeout));
        });
    }

    readonly glowColor = computed(() => FACTION_GLOW[this.role()]);
    readonly icon = computed(() => {
        // ROLE_ICON is a fixed, hardcoded lookup table of SVG markup (role-icon.util.ts), never
        // user input.
        // eslint-disable-next-line no-restricted-syntax
        return this.sanitizer.bypassSecurityTrustHtml(ROLE_ICON[this.role()]);
    });
}
