import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
    AdvanceToVotingRequest,
    CastVoteRequest,
    CloseVotingRequest,
    GameLogResponse,
    GameStateResponse,
    PassHunterRevengeRequest,
    PassWitchRequest,
    SubmitCupidPairingRequest,
    SubmitDoctorProtectionRequest,
    SubmitHunterRevengeShotRequest,
    SubmitSeerInspectionRequest,
    SubmitWerewolfVoteRequest,
    UseWitchHealPotionRequest,
    UseWitchPoisonPotionRequest
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

    getState(roomCode: string): Observable<GameStateResponse> {
        return this.http.get<GameStateResponse>(`${this.baseUrl}/${roomCode}`);
    }

    getLog(roomCode: string): Observable<GameLogResponse> {
        return this.http.get<GameLogResponse>(`${this.baseUrl}/${roomCode}/log`);
    }
}
