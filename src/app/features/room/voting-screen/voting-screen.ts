import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GameApiService } from '../../../core/services/game-api.service';
import { GameStateService } from '../../../core/services/game-state.service';
import { PlayerIdentityService } from '../../../core/services/player-identity.service';
import { WerewolfHubService } from '../../../core/services/werewolf-hub.service';
import { GameTable } from '../../../shared/components/game-table/game-table';
import { PlayerCard } from '../../../shared/components/player-card/player-card';

@Component({
    selector: 'app-voting-screen',
    imports: [GameTable, PlayerCard],
    templateUrl: './voting-screen.html',
    styleUrl: './voting-screen.scss'
})
export class VotingScreen {
    private readonly gameApi = inject(GameApiService);
    private readonly gameState = inject(GameStateService);
    private readonly playerIdentity = inject(PlayerIdentityService);
    private readonly hub = inject(WerewolfHubService);

    readonly state = this.gameState.gameState;
    readonly selectedTarget = signal<string | null | undefined>(undefined);
    private readonly votesByVoter = signal<Map<string, string | null>>(new Map());

    readonly isHost = computed(
        () => this.gameState.lobby()?.hostPlayerId === this.playerIdentity.playerId()
    );

    readonly alivePlayers = computed(() => (this.state()?.players ?? []).filter((p) => p.isAlive));

    readonly votedCount = computed(() => this.votesByVoter().size);

    constructor() {
        this.hub.notifications$.pipe(takeUntilDestroyed()).subscribe((notification) => {
            if (notification.kind === 'vote.cast') {
                const next = new Map(this.votesByVoter());
                next.set(notification.voterPlayerId, notification.targetPlayerId);
                this.votesByVoter.set(next);
            }
        });
    }

    playerName(playerId: string): string {
        return (
            this.gameState.lobby()?.players.find((p) => p.playerId === playerId)?.displayName ??
            playerId
        );
    }

    voteCountFor(playerId: string): number {
        let count = 0;
        for (const target of this.votesByVoter().values()) {
            if (target === playerId) {
                count += 1;
            }
        }
        return count;
    }

    abstainCount(): number {
        let count = 0;
        for (const target of this.votesByVoter().values()) {
            if (target === null) {
                count += 1;
            }
        }
        return count;
    }

    select(playerId: string | null): void {
        this.selectedTarget.set(playerId);
    }

    submitVote(): void {
        const roomCode = this.gameState.roomCode();
        const selected = this.selectedTarget();
        if (!roomCode || selected === undefined) {
            return;
        }
        this.gameApi
            .castVote({
                roomCode,
                voterPlayerId: this.playerIdentity.playerId(),
                targetPlayerId: selected ?? undefined
            })
            .subscribe();
    }

    closeVotingEarly(): void {
        const roomCode = this.gameState.roomCode();
        if (!roomCode) {
            return;
        }
        this.gameApi
            .closeVoting({ roomCode, requestedBy: this.playerIdentity.playerId() })
            .subscribe();
    }
}
