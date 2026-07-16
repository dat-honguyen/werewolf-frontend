import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { GameStateService } from '../../../core/services/game-state.service';
import { LobbyApiService } from '../../../core/services/lobby-api.service';
import { PlayerIdentityService } from '../../../core/services/player-identity.service';
import { ToastService } from '../../../core/services/toast.service';
import { extractErrorMessage } from '../../../core/utils/http-error.util';
import { PlayerCard } from '../../../shared/components/player-card/player-card';
import { GameTable } from '../../../shared/components/game-table/game-table';
import {
    DEFAULT_GAME_SETTINGS,
    GameSettings,
    LocalLobbyPlayer
} from '../../../core/models/lobby.model';
import { Role } from '../../../core/models/role.model';

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
    selector: 'app-lobby-screen',
    imports: [FormsModule, PlayerCard, GameTable],
    templateUrl: './lobby-screen.html',
    styleUrl: './lobby-screen.scss'
})
export class LobbyScreen {
    private readonly gameState = inject(GameStateService);
    private readonly lobbyApi = inject(LobbyApiService);
    private readonly playerIdentity = inject(PlayerIdentityService);
    private readonly toast = inject(ToastService);
    private readonly router = inject(Router);

    readonly allRoles = ALL_ROLES;
    readonly showRoleDistribution = signal(false);
    readonly showGameSettings = signal(false);
    readonly roleDistributionDraft = signal<Partial<Record<Role, number>>>({});
    readonly gameSettingsDraft = signal<GameSettings>(DEFAULT_GAME_SETTINGS);

    readonly lobby = this.gameState.lobby;
    readonly myPlayerId = this.playerIdentity.playerId;

    readonly isHost = computed(() => this.lobby()?.hostPlayerId === this.myPlayerId());
    readonly myPlayer = computed<LocalLobbyPlayer | undefined>(() =>
        this.lobby()?.players.find((player) => player.playerId === this.myPlayerId())
    );
    readonly allReady = computed(() =>
        (this.lobby()?.players ?? []).every((player) => player.isReady)
    );
    readonly canStart = computed(() => {
        const lobby = this.lobby();
        if (!lobby) {
            return false;
        }
        if (lobby.players.length < lobby.settings.minPlayers) {
            return false;
        }
        return this.allReady() || lobby.settings.allowForceStart;
    });
    readonly needsForceStart = computed(
        () => !this.allReady() && (this.lobby()?.settings.allowForceStart ?? false)
    );

    get roomCode(): string {
        return this.lobby()?.roomCode ?? '';
    }

    copyInviteLink(): void {
        const url = `${location.origin}/room/${this.roomCode}`;
        void navigator.clipboard.writeText(url);
    }

    toggleReady(): void {
        const lobby = this.lobby();
        const me = this.myPlayer();
        if (!lobby || !me) {
            return;
        }
        const nextReady = !me.isReady;
        this.lobbyApi
            .setReady({ roomCode: lobby.roomCode, playerId: this.myPlayerId(), isReady: nextReady })
            .subscribe({
                next: () => {
                    this.gameState.lobby.set({
                        ...lobby,
                        players: lobby.players.map((player) =>
                            player.playerId === me.playerId
                                ? { ...player, isReady: nextReady }
                                : player
                        )
                    });
                },
                error: (error: unknown) =>
                    this.toast.show(
                        extractErrorMessage(error, 'Could not update ready state.'),
                        'error'
                    )
            });
    }

    kick(playerId: string): void {
        const lobby = this.lobby();
        if (!lobby) {
            return;
        }
        const kicked = lobby.players.find((player) => player.playerId === playerId);
        this.lobbyApi
            .kickPlayer({ roomCode: lobby.roomCode, requestedBy: this.myPlayerId(), playerId })
            .subscribe({
                next: () => {
                    this.gameState.lobby.set({
                        ...lobby,
                        players: lobby.players.filter((player) => player.playerId !== playerId)
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

    leaveLobby(): void {
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

    toggleRoleDistribution(): void {
        const opening = !this.showRoleDistribution();
        this.showRoleDistribution.set(opening);
        if (opening) {
            this.roleDistributionDraft.set({ ...(this.lobby()?.roleDistribution ?? {}) });
        }
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
                    this.toast.show('Role distribution updated.', 'success');
                },
                error: (error: unknown) =>
                    this.toast.show(
                        extractErrorMessage(error, 'Could not update role distribution.'),
                        'error'
                    )
            });
    }

    toggleGameSettings(): void {
        const opening = !this.showGameSettings();
        this.showGameSettings.set(opening);
        if (opening) {
            const settings = this.lobby()?.settings;
            if (settings) {
                this.gameSettingsDraft.set({ ...settings });
            }
        }
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

    cancelLobby(): void {
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

    startGame(): void {
        const lobby = this.lobby();
        if (!lobby) {
            return;
        }
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
    }
}
