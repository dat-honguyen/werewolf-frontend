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
export interface QuitGameRequest {
    roomCode: string;
    playerId: string;
}
export interface SendGraveChatMessageRequest {
    roomCode: string;
    playerId: string;
    text: string;
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
    currentNightRole: Role | null;
    nightPrompt: string | null;
    /** ISO timestamp the Day Discussion countdown runs out at. Null outside DayDiscussion. Purely a
     * shared clock for display -- the host still advances to Voting manually. */
    discussionDeadlineUtc: string | null;
    /** ISO timestamp the Day Voting countdown runs out at. Null outside DayVoting. Unlike
     * discussionDeadlineUtc, RoomShell auto-closes voting once this passes (see
     * advanceToVotingAction/closeVotingAction's shared auto-trigger effect). */
    votingDeadlineUtc: string | null;
    /** Monotonically increasing per-change sequence number -- see GameStateService's version-gap
     * resync: a SignalR notification is a "there's something newer" signal, not authoritative data,
     * so the client always re-fetches this endpoint and adopts whatever version it returns. */
    version: number;
}
export interface GameLogResponse {
    roomCode: string;
    gameId: string;
    entries: string[];
}

export interface ChatMessageResponse {
    senderId: string;
    senderDisplayName: string;
    text: string;
    sentAtUtc: string;
}
export interface ChatMessagesResponse {
    messages: ChatMessageResponse[];
}

// GET /api/v1/game/{roomCode}/werewolf/votes?playerId={id} -- 404 unless a living werewolf
export interface WerewolfVotesResponse {
    votes: Record<string, string | null>;
    locked: boolean;
    lockedTarget: string | null;
}

// GET /api/v1/game/{roomCode}/lovers?playerId={id} -- 404 unless one of the two lovers
export interface LoversResponse {
    firstPlayerId: string;
    secondPlayerId: string;
}

// GET /api/v1/game/{roomCode}/witch/target?playerId={id} -- 404 unless a living Witch
export interface WitchTargetResponse {
    targetPlayerId: string | null;
}
