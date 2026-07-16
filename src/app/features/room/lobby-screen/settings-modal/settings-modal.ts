import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameStateService } from '../../../../core/services/game-state.service';
import { LobbyApiService } from '../../../../core/services/lobby-api.service';
import { PlayerIdentityService } from '../../../../core/services/player-identity.service';
import { ToastService } from '../../../../core/services/toast.service';
import { extractErrorMessage } from '../../../../core/utils/http-error.util';
import { DEFAULT_GAME_SETTINGS, GameSettings } from '../../../../core/models/lobby.model';
import { Role } from '../../../../core/models/role.model';

const ALL_ROLES: Role[] = [
    'Villager',
    'Werewolf',
    'Seer',
    'Doctor',
    'Hunter',
    'Witch',
    'Cupid',
    'Tanner'
];

@Component({
    selector: 'app-settings-modal',
    imports: [FormsModule],
    templateUrl: './settings-modal.html',
    styleUrl: './settings-modal.scss'
})
export class SettingsModal {
    private readonly gameState = inject(GameStateService);
    private readonly lobbyApi = inject(LobbyApiService);
    private readonly playerIdentity = inject(PlayerIdentityService);
    private readonly toast = inject(ToastService);

    readonly closed = output<void>();
    /** True while a game is in progress -- rules are locked in once assigned, so this shows
     * everyone the configured settings without letting anyone edit them. */
    readonly readOnly = input(false);

    readonly allRoles = ALL_ROLES;
    readonly roleDistributionDraft = signal<Partial<Record<Role, number>>>({
        ...(this.gameState.lobby()?.roleDistribution ?? {})
    });
    readonly gameSettingsDraft = signal<GameSettings>({
        ...(this.gameState.lobby()?.settings ?? DEFAULT_GAME_SETTINGS)
    });

    readonly lobby = this.gameState.lobby;
    readonly myPlayerId = this.playerIdentity.playerId;

    readonly roomCode = computed(() => this.lobby()?.roomCode ?? '');

    draftRoleCount(role: Role): number {
        return this.roleDistributionDraft()[role] ?? 0;
    }

    setDraftRoleCount(role: Role, count: number): void {
        this.roleDistributionDraft.update((draft) => ({ ...draft, [role]: count }));
    }

    applyRoleDistribution(): void {
        const lobby = this.lobby();
        if (!lobby) {
            return;
        }
        const distribution = this.roleDistributionDraft();
        this.lobbyApi
            .updateRoleDistribution({
                roomCode: lobby.roomCode,
                requestedBy: this.myPlayerId(),
                distribution
            })
            .subscribe({
                next: () => {
                    this.gameState.lobby.set({ ...lobby, roleDistribution: distribution });
                    this.toast.show('Role distribution updated.', 'success');
                },
                error: (error: unknown) =>
                    this.toast.show(
                        extractErrorMessage(error, 'Could not update role distribution.'),
                        'error'
                    )
            });
    }

    setDraftSetting<K extends keyof GameSettings>(key: K, value: GameSettings[K]): void {
        this.gameSettingsDraft.update((draft) => ({ ...draft, [key]: value }));
    }

    applyGameSettings(): void {
        const lobby = this.lobby();
        if (!lobby) {
            return;
        }
        const settings = this.gameSettingsDraft();
        this.lobbyApi
            .updateGameSettings({
                roomCode: lobby.roomCode,
                requestedBy: this.myPlayerId(),
                settings
            })
            .subscribe({
                next: () => {
                    this.gameState.lobby.set({ ...lobby, settings });
                    this.toast.show('Game settings updated.', 'success');
                },
                error: (error: unknown) =>
                    this.toast.show(
                        extractErrorMessage(error, 'Could not update game settings.'),
                        'error'
                    )
            });
    }
}
