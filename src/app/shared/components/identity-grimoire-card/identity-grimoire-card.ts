import { Component, computed, inject, input, model } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { GameStateService } from '../../../core/services/game-state.service';
import { Role } from '../../../core/models/role.model';
import { ROLE_ICON } from '../../../core/utils/role-icon.util';
import { roleAccent } from '../../../core/utils/role-accent.util';

/**
 * The mockup's "Identity Grimoire" flip card (werewolf_game_interface (2).html's #role-card).
 * Before a role is assigned (lobby), shows a mystery placeholder face only, not flippable.
 * Once `role()` is set, it's flippable; the first flip marks GameStateService.hasSeenRoleReveal so
 * a page refresh mid-game reopens already-flipped instead of replaying the reveal.
 */
@Component({
    selector: 'app-identity-grimoire-card',
    imports: [TranslatePipe],
    templateUrl: './identity-grimoire-card.html',
    styleUrl: './identity-grimoire-card.scss'
})
export class IdentityGrimoireCard {
    private readonly sanitizer = inject(DomSanitizer);
    private readonly gameState = inject(GameStateService);
    private readonly translate = inject(TranslateService);

    readonly role = input<Role | null>(null);

    /** A short, FE-local blurb (public/i18n/*.json's roleDescriptions) -- the backend's full,
     * multi-sentence rules-accurate description (GetRolesEndpoint) is reserved for the Role Guide
     * modal instead of being fetched just to render one line on this card. */
    readonly description = computed(() => {
        this.translate.currentLang();
        const role = this.role();
        return role ? this.translate.instant('roleDescriptions.' + role) : '';
    });

    /** A model (not a plain signal) so RoomShell can read the *current* flip state -- unlike
     * GameStateService.hasSeenRoleReveal, which only ever flips true once and stays true even
     * after flipping back to the front, this reflects whichever face is showing right now, e.g.
     * to hide the redundant objective hint once the back face's own description covers it. */
    readonly flipped = model(this.gameState.hasSeenRoleReveal());

    readonly icon = () =>
        this.role() ? this.sanitizer.bypassSecurityTrustHtml(ROLE_ICON[this.role()!]) : null;

    readonly accent = computed(() => roleAccent(this.role()));

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
