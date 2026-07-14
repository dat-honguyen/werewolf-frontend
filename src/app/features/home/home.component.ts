import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LobbyApiService } from '../../core/services/lobby-api.service';
import { PlayerIdentityService } from '../../core/services/player-identity.service';
import { GameStateService } from '../../core/services/game-state.service';

@Component({
    selector: 'app-home',
    imports: [FormsModule],
    templateUrl: './home.component.html',
    styleUrl: './home.component.scss'
})
export class HomeComponent {
    private readonly lobbyApi = inject(LobbyApiService);
    private readonly playerIdentity = inject(PlayerIdentityService);
    private readonly gameState = inject(GameStateService);
    private readonly router = inject(Router);

    readonly displayName = signal(this.playerIdentity.displayName());
    readonly joinRoomCode = signal('');
    readonly errorMessage = signal<string | null>(null);

    createRoom(): void {
        const displayName = this.displayName().trim();
        if (!displayName) {
            this.errorMessage.set('Enter a display name first.');
            return;
        }
        this.playerIdentity.setDisplayName(displayName);
        const hostPlayerId = this.playerIdentity.playerId();

        this.lobbyApi.createLobby({ hostPlayerId, hostDisplayName: displayName }).subscribe({
            next: (response) => {
                this.gameState.roomCode.set(response.roomCode);
                void this.router.navigate(['/room', response.roomCode]);
            },
            error: () => {
                this.errorMessage.set('Could not create the room. Try again.');
            }
        });
    }

    joinRoom(): void {
        const displayName = this.displayName().trim();
        const roomCode = this.joinRoomCode().trim().toUpperCase();
        if (!displayName || !roomCode) {
            this.errorMessage.set('Enter your display name and a room code.');
            return;
        }
        this.playerIdentity.setDisplayName(displayName);
        const playerId = this.playerIdentity.playerId();

        this.lobbyApi.joinLobby({ roomCode, playerId, displayName }).subscribe({
            next: () => {
                this.gameState.roomCode.set(roomCode);
                void this.router.navigate(['/room', roomCode]);
            },
            error: () => {
                this.errorMessage.set('Could not join that room. Check the code and try again.');
            }
        });
    }
}
