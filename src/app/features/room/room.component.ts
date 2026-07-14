import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { GameStateService } from '../../core/services/game-state.service';
import { LobbyApiService } from '../../core/services/lobby-api.service';
import { PlayerIdentityService } from '../../core/services/player-identity.service';
import { WerewolfHubService } from '../../core/services/werewolf-hub.service';
import { JoinNamePrompt } from './join-name-prompt/join-name-prompt';
import { LobbyScreen } from './lobby-screen/lobby-screen';
import { RoleRevealScreen } from './role-reveal-screen/role-reveal-screen';
import { NightActionPanel } from './night-action-panel/night-action-panel';
import { DayDiscussionScreen } from './day-discussion-screen/day-discussion-screen';
import { VotingScreen } from './voting-screen/voting-screen';
import { HunterRevengeModal } from './hunter-revenge-modal/hunter-revenge-modal';
import { GameOverScreen } from './game-over-screen/game-over-screen';

@Component({
    selector: 'app-room',
    imports: [
        JoinNamePrompt,
        LobbyScreen,
        RoleRevealScreen,
        NightActionPanel,
        DayDiscussionScreen,
        VotingScreen,
        HunterRevengeModal,
        GameOverScreen
    ],
    templateUrl: './room.component.html',
    styleUrl: './room.component.scss'
})
export class RoomComponent implements OnInit, OnDestroy {
    private readonly route = inject(ActivatedRoute);
    private readonly hub = inject(WerewolfHubService);
    private readonly lobbyApi = inject(LobbyApiService);
    private readonly playerIdentity = inject(PlayerIdentityService);
    readonly gameStateService = inject(GameStateService);

    private roomCode = '';
    readonly needsDisplayName = signal(false);

    ngOnInit(): void {
        this.roomCode = this.route.snapshot.paramMap.get('roomCode') ?? '';
        this.gameStateService.roomCode.set(this.roomCode);

        if (this.playerIdentity.displayName().trim()) {
            this.joinAndEnter();
        } else {
            this.needsDisplayName.set(true);
        }
    }

    onDisplayNameConfirmed(displayName: string): void {
        this.playerIdentity.setDisplayName(displayName);
        this.needsDisplayName.set(false);
        this.joinAndEnter();
    }

    private joinAndEnter(): void {
        this.lobbyApi
            .joinLobby({
                roomCode: this.roomCode,
                playerId: this.playerIdentity.playerId(),
                displayName: this.playerIdentity.displayName()
            })
            .subscribe({
                next: () => this.enterRoom(),
                error: () => this.enterRoom()
            });
    }

    private enterRoom(): void {
        void this.hub
            .connect()
            .then(() => this.hub.joinRoom(this.roomCode, this.playerIdentity.playerId()));
        void this.gameStateService.refreshLobby(this.roomCode);
        void this.gameStateService.refreshGameState(this.roomCode);
        this.gameStateService.startPolling();
    }

    ngOnDestroy(): void {
        this.gameStateService.stopPolling();
        void this.hub.leaveRoom(this.roomCode, this.playerIdentity.playerId());
        void this.hub.disconnect();
    }
}
