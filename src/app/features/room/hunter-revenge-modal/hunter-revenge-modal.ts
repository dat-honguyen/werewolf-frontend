import { Component, computed, inject } from '@angular/core';
import { GameApiService } from '../../../core/services/game-api.service';
import { GameStateService } from '../../../core/services/game-state.service';
import { PlayerIdentityService } from '../../../core/services/player-identity.service';
import {
    PlayerPicker,
    PlayerPickerCandidate
} from '../../../shared/components/player-picker/player-picker';

@Component({
    selector: 'app-hunter-revenge-modal',
    imports: [PlayerPicker],
    templateUrl: './hunter-revenge-modal.html',
    styleUrl: './hunter-revenge-modal.scss'
})
export class HunterRevengeModal {
    private readonly gameApi = inject(GameApiService);
    private readonly gameState = inject(GameStateService);
    private readonly playerIdentity = inject(PlayerIdentityService);

    readonly state = this.gameState.gameState;

    readonly isMyTurn = computed(
        () => this.state()?.pendingHunterRevenge[0] === this.playerIdentity.playerId()
    );

    readonly candidates = computed<PlayerPickerCandidate[]>(() =>
        (this.state()?.players ?? [])
            .filter((p) => p.isAlive)
            .map((p) => ({ playerId: p.playerId, displayName: this.playerName(p.playerId) }))
    );

    playerName(playerId: string): string {
        return (
            this.gameState.lobby()?.players.find((p) => p.playerId === playerId)?.displayName ??
            playerId
        );
    }

    shoot(targetPlayerId: string | null): void {
        const roomCode = this.gameState.roomCode();
        if (!roomCode || !targetPlayerId) {
            return;
        }
        this.gameApi
            .submitHunterRevengeShot({
                roomCode,
                playerId: this.playerIdentity.playerId(),
                targetPlayerId
            })
            .subscribe();
    }

    pass(): void {
        const roomCode = this.gameState.roomCode();
        if (!roomCode) {
            return;
        }
        this.gameApi
            .passHunterRevenge({ roomCode, playerId: this.playerIdentity.playerId() })
            .subscribe();
    }
}
