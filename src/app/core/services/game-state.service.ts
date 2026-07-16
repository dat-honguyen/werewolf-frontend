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

    /** The last GameState.Version / LobbyState.Version this client knows about -- see the
     * version-gap resync in startSync() below. These are two unrelated counters (different
     * aggregates), tracked separately so a lobby.updated notification's version is never compared
     * against the game's, or vice versa. Both start at 0 (lower than any real version) so the first
     * relevant notification for a freshly-mounted room always triggers a fetch. */
    private lastKnownVersion = 0;
    private lastKnownLobbyVersion = 0;

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

    /** The single "GetCurrentState()" call in the version-gap resync pattern -- always fetches the
     * server's authoritative state and adopts whatever version it reports. `Math.max` guards
     * against a slow response from an older request resolving after a newer one already landed. */
    async refreshGameState(roomCode: string): Promise<void> {
        try {
            const state = await firstValueFrom(this.gameApi.getState(roomCode));
            this.gameState.set(state);
            this.lastKnownVersion = Math.max(this.lastKnownVersion, state.version);
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
            this.lastKnownLobbyVersion = Math.max(this.lastKnownLobbyVersion, next.version);
        } catch {
            // Lobby not found (bad room code) — safe no-op.
        }
    }

    /**
     * Connects lobby/game state to SignalR notifications using a version-gap resync pattern: the
     * server is the single source of truth, SignalR only tells us *that* something changed (via a
     * `stateVersion` on the notification), and we always re-fetch full state rather than trying to
     * apply the notification's payload as authoritative. This removes the need for any polling
     * timer -- a dropped message, a reconnect, or a page refresh are all just "my version is behind
     * (or unknown), go fetch" cases handled by the same code path:
     *   - Behind (stateVersion > last known): fetch. Works identically whether the gap is one event
     *     or ten -- there's no attempt to replay/interpolate the missed events client-side.
     *   - Not behind (stateVersion <= last known): ignore -- a stale/duplicate/out-of-order
     *     notification that doesn't need another round-trip.
     *   - Reconnect or initial mount: always fetch unconditionally (see reconnected$ below and
     *     RoomComponent.enterRoom's initial refreshGameState call) since messages could have been
     *     missed silently while disconnected, with no notification at all to compare a version against.
     * lobby.updated and every other kind are versioned against two separate counters (LobbyState.Version
     * vs GameState.Version are unrelated aggregates/sequences), so they're handled as two branches
     * rather than one shared comparison.
     */
    startSync(): void {
        if (this.notificationsSubscription) {
            return;
        }
        const roomCode = this.roomCode();
        if (!roomCode) {
            return;
        }

        this.notificationsSubscription = this.hub.notifications$.subscribe((notification) => {
            if (LOBBY_RELEVANT_NOTIFICATION_KINDS.has(notification.kind)) {
                this.resyncIfNewer(
                    notification.stateVersion,
                    () => this.lastKnownLobbyVersion,
                    (v) => (this.lastKnownLobbyVersion = v),
                    () => void this.refreshLobby(roomCode),
                    '[Lobby]'
                );
            } else if (notification.stateVersion !== undefined) {
                this.resyncIfNewer(
                    notification.stateVersion,
                    () => this.lastKnownVersion,
                    (v) => (this.lastKnownVersion = v),
                    () => void this.refreshGameState(roomCode),
                    '[GameState]'
                );
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

    private resyncIfNewer(
        notifiedVersion: number | undefined,
        getLastKnown: () => number,
        setLastKnown: (version: number) => void,
        refresh: () => void,
        logTag: string
    ): void {
        if (notifiedVersion === undefined || notifiedVersion <= getLastKnown()) {
            return;
        }
        const lastKnown = getLastKnown();
        if (lastKnown > 0 && notifiedVersion > lastKnown + 1) {
            console.warn(
                `${logTag} version gap: had ${lastKnown}, notification is ${notifiedVersion} -- resyncing`
            );
        }
        // Adopt optimistically before the round-trip completes so a burst of notifications arriving
        // while the fetch is in flight doesn't each trigger their own redundant GET.
        setLastKnown(notifiedVersion);
        refresh();
    }

    stopSync(): void {
        this.notificationsSubscription?.unsubscribe();
        this.notificationsSubscription = null;
        this.reconnectedSubscription?.unsubscribe();
        this.reconnectedSubscription = null;
        // Reset so a later room (rejoin, or a different room entirely) can't have its first
        // notification silently ignored against a stale version left over from this one.
        this.lastKnownVersion = 0;
        this.lastKnownLobbyVersion = 0;
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
        this.lastKnownVersion = 0;
        this.lastKnownLobbyVersion = 0;
        void this.router.navigate(['/']);
    }
}
