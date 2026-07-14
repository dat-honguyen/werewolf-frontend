import { Role } from './role.model';

export type GamePhase =
    'RoleAssignment' | 'Night' | 'DayDiscussion' | 'DayVoting' | 'DayResolution' | 'GameOver';

export interface SubmitCupidPairingRequest {
    roomCode: string;
    playerId: string;
    firstPlayerId: string;
    secondPlayerId: string;
}
export interface SubmitWerewolfVoteRequest {
    roomCode: string;
    playerId: string;
    targetPlayerId?: string;
}
export interface SubmitDoctorProtectionRequest {
    roomCode: string;
    playerId: string;
    targetPlayerId: string;
}
export interface SubmitSeerInspectionRequest {
    roomCode: string;
    playerId: string;
    targetPlayerId: string;
}
export interface UseWitchHealPotionRequest {
    roomCode: string;
    playerId: string;
}
export interface UseWitchPoisonPotionRequest {
    roomCode: string;
    playerId: string;
    targetPlayerId: string;
}
export interface PassWitchRequest {
    roomCode: string;
    playerId: string;
}
export interface SubmitHunterRevengeShotRequest {
    roomCode: string;
    playerId: string;
    targetPlayerId: string;
}
export interface PassHunterRevengeRequest {
    roomCode: string;
    playerId: string;
}
export interface AdvanceToVotingRequest {
    roomCode: string;
    requestedBy: string;
}
export interface CastVoteRequest {
    roomCode: string;
    voterPlayerId: string;
    targetPlayerId?: string;
}
export interface CloseVotingRequest {
    roomCode: string;
    requestedBy: string;
}

export interface GameStateResponse {
    roomCode: string;
    phase: GamePhase;
    nightNumber: number;
    dayNumber: number;
    players: { playerId: string; role: Role; isAlive: boolean }[];
    lovers: { firstPlayerId: string; secondPlayerId: string } | null;
    werewolfLockedTarget: string | null;
    pendingHunterRevenge: string[];
    result: {
        winningFaction: 'Villagers' | 'Werewolves' | 'Lovers' | 'Tanner';
        endedAtUtc: string;
        finalRoles: Record<string, Role>;
    } | null;
}
export interface GameLogResponse {
    roomCode: string;
    gameId: string;
    entries: string[];
}
