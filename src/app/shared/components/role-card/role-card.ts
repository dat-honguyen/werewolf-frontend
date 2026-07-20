import { Component, computed, inject, input } from '@angular/core';
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

    readonly glowColor = computed(() => FACTION_GLOW[this.role()]);
    readonly icon = computed(() => {
        // ROLE_ICON is a fixed, hardcoded lookup table of SVG markup (role-icon.util.ts), never
        // user input.
        // eslint-disable-next-line no-restricted-syntax
        return this.sanitizer.bypassSecurityTrustHtml(ROLE_ICON[this.role()]);
    });
}
