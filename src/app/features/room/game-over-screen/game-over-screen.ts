import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { GameApiService } from '../../../core/services/game-api.service';
import { GameStateService } from '../../../core/services/game-state.service';
import { LobbyApiService } from '../../../core/services/lobby-api.service';
import { PlayerIdentityService } from '../../../core/services/player-identity.service';
import { ToastService } from '../../../core/services/toast.service';
import { extractErrorMessage } from '../../../core/utils/http-error.util';
import { RoleCard } from '../../../shared/components/role-card/role-card';
import { PhaseTransition } from '../../../shared/components/phase-transition/phase-transition';
import { Role } from '../../../core/models/role.model';

@Component({
    selector: 'app-game-over-screen',
    imports: [RoleCard, PhaseTransition],
    templateUrl: './game-over-screen.html',
    styleUrl: './game-over-screen.scss'
})
export class GameOverScreen {
    private readonly gameApi = inject(GameApiService);
    private readonly gameState = inject(GameStateService);
    private readonly lobbyApi = inject(LobbyApiService);
    private readonly playerIdentity = inject(PlayerIdentityService);
    private readonly toast = inject(ToastService);
    private readonly router = inject(Router);

    readonly isHost = computed(
        () => this.gameState.lobby()?.hostPlayerId === this.playerIdentity.playerId()
    );

    readonly result = computed(() => this.gameState.gameState()?.result ?? null);
    readonly finalRoles = computed<{ playerId: string; role: Role }[]>(() => {
        const roles = this.result()?.finalRoles ?? {};
        return Object.entries(roles).map(([playerId, role]) => ({ playerId, role }));
    });

    readonly showTransition = signal(true);
    readonly logEntries = signal<string[] | null>(null);

    playerName(playerId: string): string {
        return (
            this.gameState.lobby()?.players.find((p) => p.playerId === playerId)?.displayName ??
            playerId
        );
    }

    dismissTransition(): void {
        this.showTransition.set(false);
    }

    viewLog(): void {
        const roomCode = this.gameState.roomCode();
        if (!roomCode) {
            return;
        }
        this.gameApi.getLog(roomCode).subscribe((log) => this.logEntries.set(log.entries));
    }

    /** Host-only: reopens the lobby for another round without leaving the room. Everyone else's
     * view flips back to the lobby screen on its own once the resulting `lobby.updated` push
     * resyncs them (existing mechanism -- see GameStateService.startSync). */
    startRematch(): void {
        const roomCode = this.gameState.roomCode();
        if (!roomCode) {
            return;
        }
        this.lobbyApi.rematch({ roomCode, requestedBy: this.playerIdentity.playerId() }).subscribe({
            next: () => {
                this.gameState.resetForRematch();
                void this.gameState.refreshLobby(roomCode);
            },
            error: (error: unknown) =>
                this.toast.show(extractErrorMessage(error, 'Could not start a rematch.'), 'error')
        });
    }

    leaveRoom(): void {
        this.playerIdentity.clearActiveRoom();
        void this.router.navigate(['/']);
    }
}
