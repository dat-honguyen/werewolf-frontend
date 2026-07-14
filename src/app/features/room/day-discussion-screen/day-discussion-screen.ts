import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GameApiService } from '../../../core/services/game-api.service';
import { GameStateService } from '../../../core/services/game-state.service';
import { PlayerIdentityService } from '../../../core/services/player-identity.service';
import { WerewolfHubService } from '../../../core/services/werewolf-hub.service';
import { PlayerCard } from '../../../shared/components/player-card/player-card';

interface LastDeath {
    playerId: string;
    cause: string;
}

@Component({
    selector: 'app-day-discussion-screen',
    imports: [PlayerCard],
    templateUrl: './day-discussion-screen.html',
    styleUrl: './day-discussion-screen.scss'
})
export class DayDiscussionScreen {
    private readonly gameApi = inject(GameApiService);
    private readonly gameState = inject(GameStateService);
    private readonly playerIdentity = inject(PlayerIdentityService);
    private readonly hub = inject(WerewolfHubService);

    readonly lastDeath = signal<LastDeath | null>(null);
    readonly state = this.gameState.gameState;

    readonly isHost = computed(
        () => this.gameState.lobby()?.hostPlayerId === this.playerIdentity.playerId()
    );

    constructor() {
        this.hub.notifications$.pipe(takeUntilDestroyed()).subscribe((notification) => {
            if (notification.kind === 'player.died') {
                this.lastDeath.set({ playerId: notification.playerId, cause: notification.cause });
            }
        });
    }

    playerName(playerId: string): string {
        return (
            this.gameState.lobby()?.players.find((p) => p.playerId === playerId)?.displayName ??
            playerId
        );
    }

    advanceToVoting(): void {
        const roomCode = this.gameState.roomCode();
        if (!roomCode) {
            return;
        }
        this.gameApi
            .advanceToVoting({ roomCode, requestedBy: this.playerIdentity.playerId() })
            .subscribe();
    }
}
