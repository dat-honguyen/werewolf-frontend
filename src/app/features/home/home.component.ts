import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LobbyApiService } from '../../core/services/lobby-api.service';
import { PlayerIdentityService } from '../../core/services/player-identity.service';
import { GameStateService } from '../../core/services/game-state.service';
import { resolveUniqueDisplayName } from '../../core/utils/display-name.util';
import { OpenLobbySummary } from '../../core/models/lobby.model';

type HomeTab = 'create' | 'join';

const ROOM_CODE_LENGTH = 6;

/**
 * Mirrors GameSettings.DefaultRoleDistribution() on the backend -- shown read-only until room
 * creation actually accepts a role selection (see CreateLobbyEndpoint: it only takes a host id
 * and display name today).
 */
const DEFAULT_SPECIAL_ROLES: { label: string; included: boolean }[] = [
    { label: 'Seer', included: true },
    { label: 'Witch', included: true },
    { label: 'Hunter', included: true },
    { label: 'Cupid', included: false }
];

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
    readonly errorMessage = signal<string | null>(null);
    readonly activeRoomCode = this.playerIdentity.activeRoomCode;

    readonly activeTab = signal<HomeTab>('create');
    readonly codeChars = signal<string[]>(new Array<string>(ROOM_CODE_LENGTH).fill(''));
    readonly joinRoomCode = computed(() => this.codeChars().join(''));

    readonly openLobbies = signal<OpenLobbySummary[] | null>(null);
    readonly isBrowsingLobbies = signal(false);

    readonly defaultSpecialRoles = DEFAULT_SPECIAL_ROLES;

    selectTab(tab: HomeTab): void {
        this.activeTab.set(tab);
        if (tab === 'join' && this.openLobbies() === null) {
            this.loadOpenLobbies();
        }
    }

    loadOpenLobbies(): void {
        this.isBrowsingLobbies.set(true);
        this.lobbyApi.browseOpenLobbies().subscribe({
            next: (lobbies) => {
                this.openLobbies.set(lobbies);
                this.isBrowsingLobbies.set(false);
            },
            error: () => {
                this.openLobbies.set([]);
                this.isBrowsingLobbies.set(false);
            }
        });
    }

    onCodeCharInput(event: Event, index: number): void {
        const input = event.target as HTMLInputElement;
        const value = input.value
            .toUpperCase()
            .slice(-1)
            .replace(/[^A-Z0-9]/g, '');
        input.value = value;

        const chars = [...this.codeChars()];
        chars[index] = value;
        this.codeChars.set(chars);

        if (value && index < ROOM_CODE_LENGTH - 1) {
            const next = input.nextElementSibling as HTMLInputElement | null;
            next?.focus();
        }
    }

    onCodeCharKeydown(event: KeyboardEvent, index: number): void {
        if (event.key !== 'Backspace' || this.codeChars()[index]) {
            return;
        }
        const input = event.target as HTMLInputElement;
        const previous = input.previousElementSibling as HTMLInputElement | null;
        previous?.focus();
    }

    rejoinRoom(): void {
        const roomCode = this.activeRoomCode();
        if (roomCode) {
            void this.router.navigate(['/room', roomCode]);
        }
    }

    dismissRejoin(): void {
        this.playerIdentity.clearActiveRoom();
    }

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
        void this.performJoin(this.joinRoomCode());
    }

    joinBrowsedLobby(roomCode: string): void {
        void this.performJoin(roomCode);
    }

    private async performJoin(roomCode: string): Promise<void> {
        const displayName = this.displayName().trim();
        roomCode = roomCode.trim().toUpperCase();
        if (!displayName || roomCode.length < ROOM_CODE_LENGTH) {
            this.errorMessage.set('Enter your display name and a room code.');
            return;
        }
        this.playerIdentity.setDisplayName(displayName);
        const playerId = this.playerIdentity.playerId();

        const existingLobby = await firstValueFrom(this.lobbyApi.getLobby(roomCode)).catch(
            () => null
        );
        const takenNames = (existingLobby?.players ?? [])
            .filter((player) => player.playerId !== playerId)
            .map((player) => player.displayName);
        const uniqueDisplayName = resolveUniqueDisplayName(displayName, takenNames);

        this.lobbyApi.joinLobby({ roomCode, playerId, displayName: uniqueDisplayName }).subscribe({
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
