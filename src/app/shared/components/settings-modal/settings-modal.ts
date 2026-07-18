import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { GameStateService } from '../../../core/services/game-state.service';
import { LobbyApiService } from '../../../core/services/lobby-api.service';
import { PlayerIdentityService } from '../../../core/services/player-identity.service';
import { ToastService } from '../../../core/services/toast.service';
import { VersionApiService } from '../../../core/services/version-api.service';
import { extractErrorMessage } from '../../../core/utils/http-error.util';
import { DEFAULT_GAME_SETTINGS, GameSettings } from '../../../core/models/lobby.model';
import { Role } from '../../../core/models/role.model';
import { APP_VERSION } from '../../../../environments/version';
import { ToggleSwitch } from '../toggle-switch/toggle-switch';

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

/** Emoji + accent color per role, matching the mockup's Role Distribution rows
 * (werewolf_game_interface (2).html: 🌾 amber Villagers, 🐺 red Werewolves, 🔮 purple Seer,
 * 🧪 emerald Doctor, 🏹 blue Hunter). The mockup only demos those 5 roles; Witch/Cupid/Tanner
 * are real playable roles here too, so they get the same emoji+color treatment extended to fit. */
const ROLE_EMOJI: Record<Role, string> = {
    Villager: '🌾',
    Werewolf: '🐺',
    Seer: '🔮',
    Doctor: '🩺',
    Hunter: '🏹',
    Witch: '🧪',
    Cupid: '💘',
    Tanner: '🎭'
};

const ROLE_COLOR: Record<Role, string> = {
    Villager: '#fcd34d',
    Werewolf: '#f87171',
    Seer: '#c084fc',
    Doctor: '#34d399',
    Hunter: '#60a5fa',
    Witch: '#a78bfa',
    Cupid: '#f472b6',
    Tanner: '#a3e635'
};

@Component({
    selector: 'app-settings-modal',
    imports: [FormsModule, TranslatePipe, ToggleSwitch],
    templateUrl: './settings-modal.html',
    styleUrl: './settings-modal.scss'
})
export class SettingsModal {
    private readonly gameState = inject(GameStateService);
    private readonly lobbyApi = inject(LobbyApiService);
    private readonly playerIdentity = inject(PlayerIdentityService);
    private readonly toast = inject(ToastService);
    private readonly versionApi = inject(VersionApiService);
    private readonly translate = inject(TranslateService);

    readonly closed = output<void>();
    /** True while a game is in progress -- rules are locked in once assigned, so this shows
     * everyone the configured settings without letting anyone edit them. */
    readonly readOnly = input(false);

    readonly feVersion = APP_VERSION;
    readonly beVersion = signal<string>('…');

    constructor() {
        this.versionApi
            .getVersion()
            .then((version) => this.beVersion.set(version))
            .catch(() => this.beVersion.set('unknown'));
    }

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

    roleEmoji(role: Role): string {
        return ROLE_EMOJI[role];
    }

    roleColor(role: Role): string {
        return ROLE_COLOR[role];
    }

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
                    this.toast.show(
                        this.translate.instant('toasts.roleDistributionUpdated'),
                        'success'
                    );
                },
                error: (error: unknown) =>
                    this.toast.show(
                        extractErrorMessage(
                            error,
                            this.translate.instant('toasts.roleDistributionFailed')
                        ),
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
                    this.toast.show(
                        this.translate.instant('toasts.gameSettingsUpdated'),
                        'success'
                    );
                },
                error: (error: unknown) =>
                    this.toast.show(
                        extractErrorMessage(
                            error,
                            this.translate.instant('toasts.gameSettingsFailed')
                        ),
                        'error'
                    )
            });
    }
}
