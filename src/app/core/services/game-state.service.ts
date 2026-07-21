import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, Signal, WritableSignal, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
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
    private readonly translate = inject(TranslateService);

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
    private readonly pendingRetryTimeouts = new Set<ReturnType<typeof setTimeout>>();

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
     * server's authoritative state and adopts whatever version it reports. The `state.version` guard
     * on the `.set()` call (not just the separate `lastKnownVersion` counter) stops a slow response
     * from an older request clobbering a newer one that already landed while both were in flight. A
     * failed fetch is retried with backoff instead of being swallowed: `resyncIfNewer` already adopted
     * `notifiedVersion` into `lastKnownVersion` optimistically before calling this, so a fetch that
     * silently gives up here would permanently desync the client -- every later notification at or
     * below that version would then look "not newer" and never trigger another attempt. */
    async refreshGameState(roomCode: string, attempt = 0): Promise<void> {
        try {
            const state = await firstValueFrom(this.gameApi.getState(roomCode));
            const current = this.gameState();
            if (!current || state.version >= current.version) {
                this.gameState.set(state);
            }
            this.lastKnownVersion = Math.max(this.lastKnownVersion, state.version);
        } catch (error) {
            if (error instanceof HttpErrorResponse && error.status === 404) {
                // No game yet (still in lobby) — safe no-op.
                return;
            }
            this.scheduleRetry(attempt, () => void this.refreshGameState(roomCode, attempt + 1));
        }
    }

    playerDisplayName(playerId: string): string {
        return (
            this.lobby()?.players.find((player) => player.playerId === playerId)?.displayName ??
            this.translate.instant('gameState.aPlayer')
        );
    }

    async quitGame(roomCode: string): Promise<void> {
        try {
            await firstValueFrom(
                this.gameApi.quitGame({ roomCode, playerId: this.playerIdentity.playerId() })
            );
        } catch {
            this.toast.show(this.translate.instant('gameState.quitFailed'), 'error');
        }
    }

    async refreshLobby(roomCode: string, attempt = 0): Promise<void> {
        try {
            const next = await firstValueFrom(this.lobbyApi.getLobby(roomCode));
            const current = this.lobby();
            if (!current || next.version >= current.version) {
                this.announceLobbyChanges(current, next);
                this.lobby.set(next);
            }
            this.lastKnownLobbyVersion = Math.max(this.lastKnownLobbyVersion, next.version);
        } catch (error) {
            if (error instanceof HttpErrorResponse && error.status === 404) {
                // Lobby not found (bad room code) — safe no-op.
                return;
            }
            this.scheduleRetry(attempt, () => void this.refreshLobby(roomCode, attempt + 1));
        }
    }

    /** Exponential backoff, capped at 8s between attempts, for a resync fetch that failed for a
     * reason other than "doesn't exist yet" (network blip, 5xx, timeout) -- see
     * refreshGameState/refreshLobby above. Deliberately never gives up: resyncIfNewer already
     * adopted the notified version optimistically, so no *later* notification at or below that
     * version can ever re-trigger a fetch -- a bounded retry count that expires during a genuine
     * multi-second outage would leave the client permanently stuck showing stale state (e.g. a
     * night with several near-simultaneous deaths, which is more notifications = more chances to
     * land in a bad network window) until the next SignalR reconnect happens to fire. The capped
     * interval keeps retries cheap rather than hammering the server. */
    private scheduleRetry(attempt: number, retry: () => void): void {
        const delayMs = Math.min(500 * 2 ** attempt, 8000);
        const timeoutId = setTimeout(() => {
            this.pendingRetryTimeouts.delete(timeoutId);
            retry();
        }, delayMs);
        this.pendingRetryTimeouts.add(timeoutId);
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
        // Unbounded retries (see scheduleRetry) must not keep firing against a room this client has
        // already left -- they'd otherwise refetch a stale roomCode's state and could still be
        // in-flight when a later room's sync starts.
        this.pendingRetryTimeouts.forEach(clearTimeout);
        this.pendingRetryTimeouts.clear();
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
            this.toast.show(this.translate.instant('gameState.removedFromLobby'), 'error');
            this.leaveToHome();
            return;
        }

        for (const player of next.players) {
            if (!prevIds.has(player.playerId)) {
                this.announceSystem(
                    this.translate.instant('gameState.playerJoined', { name: player.displayName })
                );
            }
        }
        for (const player of prev.players) {
            if (!nextIds.has(player.playerId) && player.playerId !== myPlayerId) {
                this.announceSystem(
                    this.translate.instant('gameState.playerLeft', { name: player.displayName })
                );
            }
        }
        for (const player of next.players) {
            if (player.playerId === myPlayerId) {
                continue;
            }
            const before = prev.players.find((p) => p.playerId === player.playerId);
            if (before && before.isReady !== player.isReady) {
                this.announceSystem(
                    this.translate.instant('gameState.playerReadyChanged', {
                        name: player.displayName,
                        status: this.translate.instant(
                            player.isReady ? 'gameState.ready' : 'gameState.notReady'
                        )
                    })
                );
            }
        }
        if (prev.status !== 'Cancelled' && next.status === 'Cancelled') {
            this.toast.show(this.translate.instant('gameState.lobbyCancelled'), 'error');
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
