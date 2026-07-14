import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { GameStateService } from '../../core/services/game-state.service';
import { PlayerIdentityService } from '../../core/services/player-identity.service';
import { WerewolfHubService } from '../../core/services/werewolf-hub.service';
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
    private readonly playerIdentity = inject(PlayerIdentityService);
    readonly gameStateService = inject(GameStateService);

    private roomCode = '';

    ngOnInit(): void {
        this.roomCode = this.route.snapshot.paramMap.get('roomCode') ?? '';
        this.gameStateService.roomCode.set(this.roomCode);

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
