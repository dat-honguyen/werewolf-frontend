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
import { LocalLobbyPlayer } from '../../../core/models/lobby.model';
import { SettingsModal } from './settings-modal/settings-modal';

@Component({
    selector: 'app-lobby-screen',
    imports: [FormsModule, PlayerCard, GameTable, SettingsModal],
    templateUrl: './lobby-screen.html',
    styleUrl: './lobby-screen.scss'
})
export class LobbyScreen {
    private readonly gameState = inject(GameStateService);
    private readonly lobbyApi = inject(LobbyApiService);
    private readonly playerIdentity = inject(PlayerIdentityService);
    private readonly toast = inject(ToastService);
    private readonly router = inject(Router);

    readonly showSettings = signal(false);

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
