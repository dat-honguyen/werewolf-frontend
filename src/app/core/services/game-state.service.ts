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

export interface SystemMessage {
    text: string;
    sentAtUtc: string;
}

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

    /** Room-wide status updates (join/leave/ready/kicked/game-ended) that RoomShell folds into the
     * Town Square as system chat lines instead of ToastService popups -- a burst of these (several
     * players joining/readying within the same second) used to stack toasts tall enough to cover
     * the header and sidebar. Actual failures from the *current* user's own action (couldn't quit,
     * removed from lobby, host cancelled) stay as toasts: those need to interrupt, not scroll by in
     * a chat log the user might not be looking at. */
    readonly systemMessages: WritableSignal<SystemMessage[]> = signal([]);

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
                    `${this.playerDisplayName(notification.playerId)} abandoned the pack and bled out.`,
                    'quit'
                );
            }
            if (notification.kind === 'game.ended') {
                this.announceSystem('🏆 The game has ended.');
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

    /**
     * Called right after a successful rematch (POST /api/v1/lobby/rematch): the finished game's
     * GameState.Version was however high it got, but round 2's fresh GameState stream restarts its
     * own Version count from scratch -- without this reset, resyncIfNewer would see round 2's early
     * versions as "not newer than what I already have" and silently ignore them, leaving currentView()
     * stuck showing the finished game's GameOver screen. hasSeenRoleReveal also needs to reset so
     * round 2's own role reveal isn't skipped.
     */
    resetForRematch(): void {
        this.gameState.set(null);
        this.hasSeenRoleReveal.set(false);
        this.lastKnownVersion = 0;
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
                this.announceSystem(`${player.displayName} joined the lobby.`);
            }
        }
        for (const player of prev.players) {
            if (!nextIds.has(player.playerId) && player.playerId !== myPlayerId) {
                this.announceSystem(`${player.displayName} left the lobby.`);
            }
        }
        for (const player of next.players) {
            if (player.playerId === myPlayerId) {
                continue;
            }
            const before = prev.players.find((p) => p.playerId === player.playerId);
            if (before && before.isReady !== player.isReady) {
                this.announceSystem(
                    `${player.displayName} is ${player.isReady ? 'ready' : 'not ready'}.`
                );
            }
        }
        if (prev.status !== 'Cancelled' && next.status === 'Cancelled') {
            this.toast.show('The host cancelled the lobby.', 'error');
            this.leaveToHome();
        }
    }

    /** Appends a system chat line for RoomShell's Town Square to pick up. Guards against an
     * identical line landing twice in a row -- both `announceLobbyChanges` and the SignalR
     * `game.ended` handler above call this from a resync/notification path that can occasionally
     * re-fire for the same underlying change. */
    private announceSystem(text: string): void {
        this.systemMessages.update((messages) => {
            if (messages[messages.length - 1]?.text === text) {
                return messages;
            }
            return [...messages, { text, sentAtUtc: new Date().toISOString() }];
        });
    }

    private leaveToHome(): void {
        this.stopSync();
        this.playerIdentity.clearActiveRoom();
        this.lobby.set(null);
        this.gameState.set(null);
        this.roomCode.set(null);
        this.systemMessages.set([]);
        this.lastKnownVersion = 0;
        this.lastKnownLobbyVersion = 0;
        void this.router.navigate(['/']);
    }
}
