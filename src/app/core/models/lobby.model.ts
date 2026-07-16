import { Role } from './role.model';

export interface GameSettings {
    revealRoleOnDeath: boolean;
    doctorCanSelfProtect: boolean;
    werewolfRequiresConsensus: boolean;
    werewolfCanTargetWerewolf: boolean;
    werewolfCanVoteNoKill: boolean;
    witchSinglePotionPerNight: boolean;
    minPlayers: number;
    allowForceStart: boolean;
    witchKnowsWerewolfTarget: boolean;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
    revealRoleOnDeath: true,
    doctorCanSelfProtect: true,
    werewolfRequiresConsensus: true,
    werewolfCanTargetWerewolf: false,
    werewolfCanVoteNoKill: false,
    witchSinglePotionPerNight: false,
    minPlayers: 5,
    allowForceStart: false,
    witchKnowsWerewolfTarget: true
};

export interface CreateLobbyRequest {
    hostPlayerId: string;
    hostDisplayName: string;
}
export interface CreateLobbyResponse {
    roomCode: string;
}
export interface JoinLobbyRequest {
    roomCode: string;
    playerId: string;
    displayName: string;
}
export interface LeaveLobbyRequest {
    roomCode: string;
    playerId: string;
}
export interface KickPlayerRequest {
    roomCode: string;
    requestedBy: string;
    playerId: string;
}
export interface SetReadyRequest {
    roomCode: string;
    playerId: string;
    isReady: boolean;
}
export interface UpdateRoleDistributionRequest {
    roomCode: string;
    requestedBy: string;
    distribution: Partial<Record<Role, number>>;
}
export interface UpdateGameSettingsRequest {
    roomCode: string;
    requestedBy: string;
    settings: GameSettings;
}
export interface CancelLobbyRequest {
    roomCode: string;
    requestedBy: string;
}
export interface StartGameRequest {
    roomCode: string;
    requestedBy: string;
    forceStart: boolean;
}
export interface StartGameResponse {
    gameId: string;
    roomCode: string;
}

export interface LocalLobbyPlayer {
    playerId: string;
    displayName: string;
    isReady: boolean;
}
export interface LocalLobbyState {
    roomCode: string;
    hostPlayerId: string;
    players: LocalLobbyPlayer[];
    roleDistribution: Partial<Record<Role, number>>;
    settings: GameSettings;
    status: 'Open' | 'Starting' | 'Closed' | 'Cancelled';
    /** See GameStateService's version-gap resync -- same pattern as GameStateResponse.version. */
    version: number;
}
