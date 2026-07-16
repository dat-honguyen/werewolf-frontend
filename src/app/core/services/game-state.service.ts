import { Injectable, Signal, WritableSignal, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription, firstValueFrom } from 'rxjs';
import { GameStateResponse } from '../models/game.model';
import { LocalLobbyState } from '../models/lobby.model';
import { GameApiService } from './game-api.service';
import { LobbyApiService } from './lobby-api.service';
import { PlayerIdentityService } from './player-identity.service';
import { ToastService } from './toast.service';
import { WerewolfHubService } from './werewolf-hub.service';

export type GameView =
    | 'lobby'
    | 'role-reveal'
    | 'night'
    | 'day-discussion'
    | 'voting'
    | 'hunter-revenge'
    | 'game-over';

// Refreshing on night.turn/night.narration (not just night.started) keeps `gameState.currentNightRole`
// in sync as the fixed role order advances within a night -- this runs continuously from
// `startSync()` regardless of which screen is mounted, so it also backfills the turn for a player
// who was still on the role-reveal screen when the original push fired (see night-action-panel.ts).
const PHASE_RELEVANT_NOTIFICATION_KINDS = new Set([
    'game.started',
    'night.started',
    'night.turn',
    'night.narration',
    'day.started',
    'voting.started',
    'player.died',
    'player.lynched',
    'game.ended'
]);

const LOBBY_RELEVANT_NOTIFICATION_KINDS = new Set(['lobby.updated']);

@Injectable({ providedIn: 'root' })
export class GameStateService {
    private readonly gameApi = inject(GameApiService);
    private readonly lobbyApi = inject(LobbyApiService);
    private readonly playerIdentity = inject(PlayerIdentityService);
    private readonly hub = inject(WerewolfHubService);
    private readonly toast = inject(ToastService);
    private readonly router = inject(Router);

    readonly roomCode: WritableSignal<string | null> = signal(null);
    readonly lobby: WritableSignal<LocalLobbyState | null> = signal(null);
    readonly gameState: WritableSignal<GameStateResponse | null> = signal(null);
    readonly hasSeenRoleReveal = signal(false);

    private notificationsSubscription: Subscription | null = null;
    private reconnectedSubscription: Subscription | null = null;

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

    playerDisplayName(playerId: string): string {
        return (
            this.lobby()?.players.find((player) => player.playerId === playerId)?.displayName ??
            'A player'
        );
    }

    async quitGame(roomCode: string): Promise<void> {
        try {
            await firstValueFrom(
                this.gameApi.quitGame({ roomCode, playerId: this.playerIdentity.playerId() })
            );
        } catch {
            this.toast.show('Could not quit the game. Try again.', 'error');
        }
    }

    async refreshLobby(roomCode: string): Promise<void> {
        try {
            const next = await firstValueFrom(this.lobbyApi.getLobby(roomCode));
            this.announceLobbyChanges(this.lobby(), next);
            this.lobby.set(next);
        } catch {
            // Lobby not found (bad room code) — safe no-op.
        }
    }

    /** Connects lobby/game state to SignalR notifications. No polling loop — updates are
     * driven entirely by the hub, with a one-time resync on reconnect as a safety net. */
    startSync(): void {
        if (this.notificationsSubscription) {
            return;
        }
        const roomCode = this.roomCode();
        if (!roomCode) {
            return;
        }

        this.notificationsSubscription = this.hub.notifications$.subscribe((notification) => {
            if (PHASE_RELEVANT_NOTIFICATION_KINDS.has(notification.kind)) {
                void this.refreshGameState(roomCode);
            }
            if (LOBBY_RELEVANT_NOTIFICATION_KINDS.has(notification.kind)) {
                void this.refreshLobby(roomCode);
            }
            if (notification.kind === 'player.died' && notification.cause === 'quit') {
                this.toast.show(
                    `${this.playerDisplayName(notification.playerId)} quit the game.`,
                    'error'
                );
            }
            if (notification.kind === 'game.ended') {
                this.toast.show('The game has ended.', 'info');
            }
        });

        this.reconnectedSubscription = this.hub.reconnected$.subscribe(() => {
            void this.refreshGameState(roomCode);
            void this.refreshLobby(roomCode);
        });
    }

    stopSync(): void {
        this.notificationsSubscription?.unsubscribe();
        this.notificationsSubscription = null;
        this.reconnectedSubscription?.unsubscribe();
        this.reconnectedSubscription = null;
    }

    private announceLobbyChanges(prev: LocalLobbyState | null, next: LocalLobbyState): void {
        if (!prev || prev.roomCode !== next.roomCode) {
            return;
        }
        const myPlayerId = this.playerIdentity.playerId();
        const prevIds = new Set(prev.players.map((player) => player.playerId));
        const nextIds = new Set(next.players.map((player) => player.playerId));

        if (prevIds.has(myPlayerId) && !nextIds.has(myPlayerId)) {
            this.toast.show('You were removed from the lobby.', 'error');
            this.leaveToHome();
            return;
        }

        for (const player of next.players) {
            if (!prevIds.has(player.playerId)) {
                this.toast.show(`${player.displayName} joined the lobby.`, 'info');
            }
        }
        for (const player of prev.players) {
            if (!nextIds.has(player.playerId) && player.playerId !== myPlayerId) {
                this.toast.show(`${player.displayName} left the lobby.`, 'info');
            }
        }
        for (const player of next.players) {
            if (player.playerId === myPlayerId) {
                continue;
            }
            const before = prev.players.find((p) => p.playerId === player.playerId);
            if (before && before.isReady !== player.isReady) {
                this.toast.show(
                    `${player.displayName} is ${player.isReady ? 'ready' : 'not ready'}.`,
                    'info'
                );
            }
        }
        if (prev.status !== 'Cancelled' && next.status === 'Cancelled') {
            this.toast.show('The host cancelled the lobby.', 'error');
            this.leaveToHome();
        }
    }

    private leaveToHome(): void {
        this.stopSync();
        this.playerIdentity.clearActiveRoom();
        this.lobby.set(null);
        this.gameState.set(null);
        this.roomCode.set(null);
        void this.router.navigate(['/']);
    }
}
