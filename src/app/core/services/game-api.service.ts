import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
    AdvanceToVotingRequest,
    CastVoteRequest,
    ChatMessagesResponse,
    CloseVotingRequest,
    GameLogResponse,
    GameStateResponse,
    LoversResponse,
    PassHunterRevengeRequest,
    PassWitchRequest,
    QuitGameRequest,
    SubmitCupidPairingRequest,
    SubmitDoctorProtectionRequest,
    SubmitHunterRevengeShotRequest,
    SubmitSeerInspectionRequest,
    SubmitWerewolfVoteRequest,
    UseWitchHealPotionRequest,
    UseWitchPoisonPotionRequest,
    WerewolfVotesResponse,
    WitchTargetResponse
} from '../models/game.model';

@Injectable({ providedIn: 'root' })
export class GameApiService {
    private readonly http = inject(HttpClient);
    private readonly baseUrl = `${environment.apiBaseUrl}/api/v1/game`;

    submitCupidPairing(request: SubmitCupidPairingRequest): Observable<void> {
        return this.http.post<void>(`${this.baseUrl}/cupid`, request);
    }

    submitWerewolfVote(request: SubmitWerewolfVoteRequest): Observable<void> {
        return this.http.post<void>(`${this.baseUrl}/werewolf/vote`, request);
    }

    submitDoctorProtection(request: SubmitDoctorProtectionRequest): Observable<void> {
        return this.http.post<void>(`${this.baseUrl}/doctor/protect`, request);
    }

    submitSeerInspection(request: SubmitSeerInspectionRequest): Observable<void> {
        return this.http.post<void>(`${this.baseUrl}/seer/inspect`, request);
    }

    useWitchHealPotion(request: UseWitchHealPotionRequest): Observable<void> {
        return this.http.post<void>(`${this.baseUrl}/witch/heal`, request);
    }

    useWitchPoisonPotion(request: UseWitchPoisonPotionRequest): Observable<void> {
        return this.http.post<void>(`${this.baseUrl}/witch/poison`, request);
    }

    passWitch(request: PassWitchRequest): Observable<void> {
        return this.http.post<void>(`${this.baseUrl}/witch/pass`, request);
    }

    submitHunterRevengeShot(request: SubmitHunterRevengeShotRequest): Observable<void> {
        return this.http.post<void>(`${this.baseUrl}/hunter/shoot`, request);
    }

    passHunterRevenge(request: PassHunterRevengeRequest): Observable<void> {
        return this.http.post<void>(`${this.baseUrl}/hunter/pass`, request);
    }

    advanceToVoting(request: AdvanceToVotingRequest): Observable<void> {
        return this.http.post<void>(`${this.baseUrl}/voting/advance`, request);
    }

    castVote(request: CastVoteRequest): Observable<void> {
        return this.http.post<void>(`${this.baseUrl}/vote`, request);
    }

    closeVoting(request: CloseVotingRequest): Observable<void> {
        return this.http.post<void>(`${this.baseUrl}/voting/close`, request);
    }

    quitGame(request: QuitGameRequest): Observable<void> {
        return this.http.post<void>(`${this.baseUrl}/quit`, request);
    }

    getState(roomCode: string): Observable<GameStateResponse> {
        return this.http.get<GameStateResponse>(`${this.baseUrl}/${roomCode}`);
    }

    getLog(roomCode: string): Observable<GameLogResponse> {
        return this.http.get<GameLogResponse>(`${this.baseUrl}/${roomCode}/log`);
    }

    /** 404s unless `playerId` is themselves a living werewolf -- see GAME_FLOW.md §7 for why this
     * is polled over HTTP instead of pushed via SignalR. */
    getWerewolfVotes(roomCode: string, playerId: string): Observable<WerewolfVotesResponse> {
        return this.http.get<WerewolfVotesResponse>(
            `${this.baseUrl}/${roomCode}/werewolf/votes?playerId=${encodeURIComponent(playerId)}`
        );
    }

    /** 404s unless `playerId` is one of the two players Cupid paired. */
    getLovers(roomCode: string, playerId: string): Observable<LoversResponse> {
        return this.http.get<LoversResponse>(
            `${this.baseUrl}/${roomCode}/lovers?playerId=${encodeURIComponent(playerId)}`
        );
    }

    /** 404s unless `playerId` is a living Witch. `targetPlayerId` is always null unless the game's
     * WitchKnowsWerewolfTarget setting is on. */
    getWitchTarget(roomCode: string, playerId: string): Observable<WitchTargetResponse> {
        return this.http.get<WitchTargetResponse>(
            `${this.baseUrl}/${roomCode}/witch/target?playerId=${encodeURIComponent(playerId)}`
        );
    }

    getRoomChat(roomCode: string): Observable<ChatMessagesResponse> {
        return this.http.get<ChatMessagesResponse>(`${this.baseUrl}/${roomCode}/chat/room`);
    }
}
