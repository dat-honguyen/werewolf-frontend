import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { GameApiService } from '../../../core/services/game-api.service';
import { GameStateService } from '../../../core/services/game-state.service';
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
    private readonly router = inject(Router);

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

    returnToLobby(): void {
        void this.router.navigate(['/']);
    }
}
