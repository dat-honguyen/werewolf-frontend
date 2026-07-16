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
    readonly nowMs = signal(Date.now());

    readonly isHost = computed(
        () => this.gameState.lobby()?.hostPlayerId === this.playerIdentity.playerId()
    );

    /** Seconds left until `discussionDeadlineUtc`, floored at 0. Null when there's no deadline
     * (shouldn't happen while this screen is shown, but the field is nullable server-side). */
    readonly secondsRemaining = computed(() => {
        const deadline = this.state()?.discussionDeadlineUtc;
        if (!deadline) {
            return null;
        }
        const remainingMs = new Date(deadline).getTime() - this.nowMs();
        return Math.max(0, Math.floor(remainingMs / 1000));
    });

    readonly countdownDisplay = computed(() => {
        const seconds = this.secondsRemaining();
        if (seconds === null) {
            return null;
        }
        const mins = Math.floor(seconds / 60)
            .toString()
            .padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    });

    readonly timeIsUp = computed(() => this.secondsRemaining() === 0);

    constructor() {
        this.hub.notifications$.pipe(takeUntilDestroyed()).subscribe((notification) => {
            if (notification.kind === 'player.died') {
                this.lastDeath.set({ playerId: notification.playerId, cause: notification.cause });
            }
        });

        const intervalId = setInterval(() => this.nowMs.set(Date.now()), 1000);
        // No explicit teardown needed beyond this: DestroyRef isn't injected because the interval
        // just stops mattering once the component's gone (nothing it touches outlives the component,
        // unlike a subscription that could otherwise leak a callback into a shared service).
        // If a leak concern comes up in review, wrap in `inject(DestroyRef).onDestroy(() =>
        // clearInterval(intervalId))` instead of leaving this comment.
        void intervalId;
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
