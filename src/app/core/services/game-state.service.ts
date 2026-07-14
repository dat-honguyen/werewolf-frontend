import { Injectable, Signal, WritableSignal, computed, inject, signal } from '@angular/core';
import { Subscription, firstValueFrom } from 'rxjs';
import { GameStateResponse } from '../models/game.model';
import { LocalLobbyState } from '../models/lobby.model';
import { GameApiService } from './game-api.service';
import { LobbyApiService } from './lobby-api.service';
import { PlayerIdentityService } from './player-identity.service';
import { WerewolfHubService } from './werewolf-hub.service';

export type GameView =
    | 'lobby'
    | 'role-reveal'
    | 'night'
    | 'day-discussion'
    | 'voting'
    | 'hunter-revenge'
    | 'game-over';

const PHASE_RELEVANT_NOTIFICATION_KINDS = new Set([
    'night.started',
    'day.started',
    'voting.started',
    'player.died',
    'player.lynched',
    'game.ended'
]);

const POLL_INTERVAL_MS = 3000;

@Injectable({ providedIn: 'root' })
export class GameStateService {
    private readonly gameApi = inject(GameApiService);
    private readonly lobbyApi = inject(LobbyApiService);
    private readonly playerIdentity = inject(PlayerIdentityService);
    private readonly hub = inject(WerewolfHubService);

    readonly roomCode: WritableSignal<string | null> = signal(null);
    readonly lobby: WritableSignal<LocalLobbyState | null> = signal(null);
    readonly gameState: WritableSignal<GameStateResponse | null> = signal(null);
    readonly hasSeenRoleReveal = signal(false);

    private pollHandle: ReturnType<typeof setInterval> | null = null;
    private notificationsSubscription: Subscription | null = null;

    get myPlayerId(): Signal<string> {
        return this.playerIdentity.playerId;
    }

    readonly currentView: Signal<GameView> = computed(() => {
        const state = this.gameState();
        if (!state) {
            return 'lobby';
        }
        if (state.pendingHunterRevenge.length > 0) {
            return 'hunter-revenge';
        }
        switch (state.phase) {
            case 'RoleAssignment':
                return this.hasSeenRoleReveal() ? 'night' : 'role-reveal';
            case 'Night':
                return this.hasSeenRoleReveal() ? 'night' : 'role-reveal';
            case 'DayDiscussion':
                return 'day-discussion';
            case 'DayVoting':
                return 'voting';
            case 'DayResolution':
                return 'day-discussion';
            case 'GameOver':
                return 'game-over';
        }
    });

    async refreshGameState(roomCode: string): Promise<void> {
        try {
            const state = await firstValueFrom(this.gameApi.getState(roomCode));
            this.gameState.set(state);
        } catch {
            // No game yet (still in lobby) — safe no-op.
        }
    }

    async refreshLobby(roomCode: string): Promise<void> {
        try {
            const lobby = await firstValueFrom(this.lobbyApi.getLobby(roomCode));
            this.lobby.set(lobby);
        } catch {
            // Lobby not found (bad room code) — safe no-op.
        }
    }

    startPolling(): void {
        if (this.pollHandle) {
            return;
        }
        const roomCode = this.roomCode();
        if (!roomCode) {
            return;
        }
        this.pollHandle = setInterval(() => {
            void this.refreshGameState(roomCode);
            if (this.currentView() === 'lobby') {
                void this.refreshLobby(roomCode);
            }
        }, POLL_INTERVAL_MS);

        this.notificationsSubscription = this.hub.notifications$.subscribe((notification) => {
            if (PHASE_RELEVANT_NOTIFICATION_KINDS.has(notification.kind)) {
                void this.refreshGameState(roomCode);
            }
        });
    }

    stopPolling(): void {
        if (this.pollHandle) {
            clearInterval(this.pollHandle);
            this.pollHandle = null;
        }
        this.notificationsSubscription?.unsubscribe();
        this.notificationsSubscription = null;
    }
}
