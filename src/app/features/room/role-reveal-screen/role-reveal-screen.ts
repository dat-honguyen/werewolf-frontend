import { Component, computed, inject, signal } from '@angular/core';
import { GameStateService } from '../../../core/services/game-state.service';
import { PlayerIdentityService } from '../../../core/services/player-identity.service';
import { RulesApiService } from '../../../core/services/rules-api.service';
import { RoleCard } from '../../../shared/components/role-card/role-card';
import { Role } from '../../../core/models/role.model';

@Component({
    selector: 'app-role-reveal-screen',
    imports: [RoleCard],
    templateUrl: './role-reveal-screen.html',
    styleUrl: './role-reveal-screen.scss'
})
export class RoleRevealScreen {
    private readonly gameState = inject(GameStateService);
    private readonly playerIdentity = inject(PlayerIdentityService);
    private readonly rulesApi = inject(RulesApiService);

    readonly description = signal('');
    readonly revealed = signal(false);

    readonly myRole = computed<Role | null>(() => {
        const state = this.gameState.gameState();
        const me = state?.players.find(
            (player) => player.playerId === this.playerIdentity.playerId()
        );
        return me?.role ?? null;
    });

    constructor() {
        void this.loadDescription();
        requestAnimationFrame(() => this.revealed.set(true));
    }

    private async loadDescription(): Promise<void> {
        const roles = await this.rulesApi.getRoles();
        const role = this.myRole();
        const info = roles.find((r) => r.role === role);
        this.description.set(info?.description ?? '');
    }

    continue(): void {
        this.gameState.hasSeenRoleReveal.set(true);
    }
}
