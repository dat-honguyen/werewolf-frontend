import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameStateService } from '../../../core/services/game-state.service';
import { LobbyApiService } from '../../../core/services/lobby-api.service';
import { PlayerIdentityService } from '../../../core/services/player-identity.service';
import { PlayerCard } from '../../../shared/components/player-card/player-card';
import { GameTable } from '../../../shared/components/game-table/game-table';
import { GameSettings, LocalLobbyPlayer } from '../../../core/models/lobby.model';
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

    readonly allRoles = ALL_ROLES;
    readonly showRoleDistribution = signal(false);
    readonly showGameSettings = signal(false);

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
            .subscribe(() => {
                this.gameState.lobby.set({
                    ...lobby,
                    players: lobby.players.map((player) =>
                        player.playerId === me.playerId ? { ...player, isReady: nextReady } : player
                    )
                });
            });
    }

    kick(playerId: string): void {
        const lobby = this.lobby();
        if (!lobby) {
            return;
        }
        this.lobbyApi
            .kickPlayer({ roomCode: lobby.roomCode, requestedBy: this.myPlayerId(), playerId })
            .subscribe(() => {
                this.gameState.lobby.set({
                    ...lobby,
                    players: lobby.players.filter((player) => player.playerId !== playerId)
                });
            });
    }

    updateRoleCount(role: Role, count: number): void {
        const lobby = this.lobby();
        if (!lobby) {
            return;
        }
        const distribution = { ...lobby.roleDistribution, [role]: count };
        this.lobbyApi
            .updateRoleDistribution({
                roomCode: lobby.roomCode,
                requestedBy: this.myPlayerId(),
                distribution
            })
            .subscribe(() => {
                this.gameState.lobby.set({ ...lobby, roleDistribution: distribution });
            });
    }

    roleCount(role: Role): number {
        return this.lobby()?.roleDistribution[role] ?? 0;
    }

    updateSetting<K extends keyof GameSettings>(key: K, value: GameSettings[K]): void {
        const lobby = this.lobby();
        if (!lobby) {
            return;
        }
        const settings = { ...lobby.settings, [key]: value };
        this.lobbyApi
            .updateGameSettings({
                roomCode: lobby.roomCode,
                requestedBy: this.myPlayerId(),
                settings
            })
            .subscribe(() => {
                this.gameState.lobby.set({ ...lobby, settings });
            });
    }

    cancelLobby(): void {
        const lobby = this.lobby();
        if (!lobby) {
            return;
        }
        this.lobbyApi
            .cancelLobby({ roomCode: lobby.roomCode, requestedBy: this.myPlayerId() })
            .subscribe(() => {
                this.gameState.lobby.set({ ...lobby, status: 'Cancelled' });
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
            .subscribe(() => {
                void this.gameState.refreshGameState(lobby.roomCode);
            });
    }
}
