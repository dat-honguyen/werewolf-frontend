import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { GameApiService } from '../../core/services/game-api.service';
import { GameStateService } from '../../core/services/game-state.service';
import { LobbyApiService } from '../../core/services/lobby-api.service';
import { PlayerIdentityService } from '../../core/services/player-identity.service';
import { ToastService } from '../../core/services/toast.service';
import { WerewolfHubService } from '../../core/services/werewolf-hub.service';
import { resolveUniqueDisplayName } from '../../core/utils/display-name.util';
import { extractErrorMessage } from '../../core/utils/http-error.util';
import { ToastList } from '../../shared/components/toast-list/toast-list';
import { ConfirmDialog } from '../../shared/components/confirm-dialog/confirm-dialog';
import { JoinNamePrompt } from './join-name-prompt/join-name-prompt';
import { LobbyScreen } from './lobby-screen/lobby-screen';
import { RoleRevealScreen } from './role-reveal-screen/role-reveal-screen';
import { NightActionPanel } from './night-action-panel/night-action-panel';
import { DayDiscussionScreen } from './day-discussion-screen/day-discussion-screen';
import { VotingScreen } from './voting-screen/voting-screen';
import { HunterRevengeModal } from './hunter-revenge-modal/hunter-revenge-modal';
import { GameOverScreen } from './game-over-screen/game-over-screen';
import { GameShell } from '../../shared/components/game-shell/game-shell';

@Component({
    selector: 'app-room',
    imports: [
        ToastList,
        ConfirmDialog,
        JoinNamePrompt,
        LobbyScreen,
        RoleRevealScreen,
        NightActionPanel,
        DayDiscussionScreen,
        VotingScreen,
        HunterRevengeModal,
        GameOverScreen,
        GameShell
    ],
    templateUrl: './room.component.html',
    styleUrl: './room.component.scss'
})
export class RoomComponent implements OnInit, OnDestroy {
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly hub = inject(WerewolfHubService);
    private readonly lobbyApi = inject(LobbyApiService);
    private readonly gameApi = inject(GameApiService);
    private readonly playerIdentity = inject(PlayerIdentityService);
    private readonly toast = inject(ToastService);
    readonly gameStateService = inject(GameStateService);

    private roomCode = '';
    readonly needsDisplayName = signal(false);
    readonly showQuitConfirm = signal(false);

    readonly canQuit = computed(
        () => !['lobby', 'game-over'].includes(this.gameStateService.currentView())
    );

    ngOnInit(): void {
        this.roomCode = this.route.snapshot.paramMap.get('roomCode') ?? '';
        this.gameStateService.roomCode.set(this.roomCode);

        if (this.playerIdentity.displayName().trim()) {
            void this.joinAndEnter();
        } else {
            this.needsDisplayName.set(true);
        }
    }

    onDisplayNameConfirmed(displayName: string): void {
        this.playerIdentity.setDisplayName(displayName);
        this.needsDisplayName.set(false);
        void this.joinAndEnter();
    }

    private async joinAndEnter(): Promise<void> {
        const myPlayerId = this.playerIdentity.playerId();

        const [existingLobby, existingGame] = await Promise.all([
            firstValueFrom(this.lobbyApi.getLobby(this.roomCode)).catch(() => null),
            firstValueFrom(this.gameApi.getState(this.roomCode)).catch(() => null)
        ]);

        // Reconnecting to a room we're already part of (closed tab, lost connection, browser
        // crash, ...) -- re-POSTing join would 400 once the lobby is closed (game in progress), so
        // skip straight to entering instead of joining again.
        const alreadyJoined =
            (existingGame?.players.some((player) => player.playerId === myPlayerId) ?? false) ||
            (existingLobby?.players.some((player) => player.playerId === myPlayerId) ?? false);

        if (alreadyJoined) {
            if (existingGame) {
                // The game was already running before this mount, so this player must have seen
                // their role reveal in an earlier session -- without this, `hasSeenRoleReveal`
                // resets to false on every fresh page load (it's in-memory only), stranding a
                // reconnecting player on the role-reveal screen instead of the live night/day view,
                // with no indication of whose turn it currently is.
                this.gameStateService.hasSeenRoleReveal.set(true);
            }
            this.enterRoom();
            return;
        }

        if (!existingLobby) {
            this.toast.show('Could not join that room. Check the code and try again.', 'error');
            void this.router.navigate(['/']);
            return;
        }

        const takenNames = existingLobby.players.map((player) => player.displayName);
        const displayName = resolveUniqueDisplayName(this.playerIdentity.displayName(), takenNames);

        this.lobbyApi
            .joinLobby({ roomCode: this.roomCode, playerId: myPlayerId, displayName })
            .subscribe({
                next: () => this.enterRoom(),
                error: (error: unknown) => {
                    this.toast.show(
                        extractErrorMessage(
                            error,
                            'Could not join that room. Check the code and try again.'
                        ),
                        'error'
                    );
                    void this.router.navigate(['/']);
                }
            });
    }

    private enterRoom(): void {
        this.playerIdentity.setActiveRoom(this.roomCode);
        void this.hub
            .connect()
            .then(() => this.hub.joinRoom(this.roomCode, this.playerIdentity.playerId()));
        void this.gameStateService.refreshLobby(this.roomCode);
        void this.gameStateService.refreshGameState(this.roomCode);
        this.gameStateService.startSync();
    }

    quitGame(): void {
        this.showQuitConfirm.set(true);
    }

    confirmQuit(): void {
        this.showQuitConfirm.set(false);
        this.playerIdentity.clearActiveRoom();
        void this.gameStateService.quitGame(this.roomCode);
    }

    cancelQuit(): void {
        this.showQuitConfirm.set(false);
    }

    ngOnDestroy(): void {
        this.gameStateService.stopSync();
        void this.hub.leaveRoom(this.roomCode, this.playerIdentity.playerId());
        void this.hub.disconnect();
    }
}
