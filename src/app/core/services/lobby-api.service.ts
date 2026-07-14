import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
    CancelLobbyRequest,
    CreateLobbyRequest,
    CreateLobbyResponse,
    JoinLobbyRequest,
    KickPlayerRequest,
    LeaveLobbyRequest,
    LocalLobbyState,
    SetReadyRequest,
    StartGameRequest,
    StartGameResponse,
    UpdateGameSettingsRequest,
    UpdateRoleDistributionRequest
} from '../models/lobby.model';

@Injectable({ providedIn: 'root' })
export class LobbyApiService {
    private readonly http = inject(HttpClient);
    private readonly baseUrl = `${environment.apiBaseUrl}/api/v1/lobby`;

    createLobby(request: CreateLobbyRequest): Observable<CreateLobbyResponse> {
        return this.http.post<CreateLobbyResponse>(this.baseUrl, request);
    }

    getLobby(roomCode: string): Observable<LocalLobbyState> {
        return this.http.get<LocalLobbyState>(`${this.baseUrl}/${roomCode}`);
    }

    joinLobby(request: JoinLobbyRequest): Observable<void> {
        return this.http.post<void>(`${this.baseUrl}/join`, request);
    }

    leaveLobby(request: LeaveLobbyRequest): Observable<void> {
        return this.http.post<void>(`${this.baseUrl}/leave`, request);
    }

    kickPlayer(request: KickPlayerRequest): Observable<void> {
        return this.http.post<void>(`${this.baseUrl}/kick`, request);
    }

    setReady(request: SetReadyRequest): Observable<void> {
        return this.http.post<void>(`${this.baseUrl}/ready`, request);
    }

    updateRoleDistribution(request: UpdateRoleDistributionRequest): Observable<void> {
        return this.http.post<void>(`${this.baseUrl}/roles`, request);
    }

    updateGameSettings(request: UpdateGameSettingsRequest): Observable<void> {
        return this.http.post<void>(`${this.baseUrl}/settings`, request);
    }

    cancelLobby(request: CancelLobbyRequest): Observable<void> {
        return this.http.post<void>(`${this.baseUrl}/cancel`, request);
    }

    startGame(request: StartGameRequest): Observable<StartGameResponse> {
        return this.http.post<StartGameResponse>(`${this.baseUrl}/start`, request);
    }
}
