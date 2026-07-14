import { Role } from './role.model';

export type WerewolfNotification =
    | { kind: 'game.started'; gameId: string }
    | { kind: 'night.started'; nightNumber: number }
    | { kind: 'day.started'; dayNumber: number }
    | { kind: 'voting.started' }
    | {
          kind: 'player.died';
          playerId: string;
          cause: 'night' | 'lynch' | 'lover-link' | 'hunter-revenge';
          role?: Role;
      }
    | { kind: 'player.lynched'; playerId: string; role?: Role }
    | { kind: 'seer.result'; targetPlayerId: string; isWerewolf: boolean }
    | { kind: 'werewolf.vote'; wolfPlayerId: string; targetPlayerId: string | null }
    | { kind: 'werewolf.locked'; targetPlayerId: string | null }
    | { kind: 'vote.cast'; voterPlayerId: string; targetPlayerId: string | null }
    | { kind: 'game.ended'; winningFaction: string; roles: Record<string, Role> }
    // Lobby kind/payload is unconfirmed against the real hub — server just needs to broadcast
    // this to the room group whenever the lobby aggregate changes (join/leave/kick/ready/
    // settings/roles/cancel); the client always re-fetches full state via GET, so no extra
    // payload fields are required.
    | { kind: 'lobby.updated' };
