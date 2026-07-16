import { Role } from './role.model';

/** `stateVersion` is present on every GameState-derived kind (absent for lobby.updated, which
 * isn't versioned) -- see GameStateService's version-gap resync. It's a "there's something newer
 * than what you have" signal only; the payload fields below are supplementary UI-only data (e.g.
 * a private seer result HTTP can't otherwise reconstruct), never treated as authoritative state. */
export type WerewolfNotification = { stateVersion?: number } & (
    | { kind: 'game.started'; gameId: string }
    | { kind: 'night.started'; nightNumber: number }
    | { kind: 'day.started'; dayNumber: number }
    | { kind: 'voting.started' }
    | {
          kind: 'player.died';
          playerId: string;
          cause: 'night' | 'lynch' | 'lover-link' | 'hunter-revenge' | 'quit';
          role?: Role;
      }
    | { kind: 'player.lynched'; playerId: string; role?: Role }
    | { kind: 'seer.result'; targetPlayerId: string; isWerewolf: boolean }
    // Werewolf pack votes/lock and Cupid's lovers are deliberately NOT pushed over SignalR (see
    // GAME_FLOW.md §7) -- poll GET .../werewolf/votes and GET .../lovers over HTTP instead.
    | {
          kind: 'night.narration';
          step: 'Cupid' | 'Werewolves' | 'Doctor' | 'Seer' | 'Witch';
          text: string;
      }
    | { kind: 'night.turn'; role: Role; prompt: string }
    | { kind: 'vote.cast'; voterPlayerId: string; targetPlayerId: string | null }
    // Broadcast/private pair mirroring night.narration/night.turn for whoever's at the head of the
    // Hunter-revenge queue. No payload needed on either -- GameStateService's version-gap resync
    // re-fetches GameStateResponse.pendingHunterRevenge on any versioned notification, so these
    // exist purely to trigger that re-fetch promptly rather than carrying data themselves.
    | { kind: 'hunter.pending' }
    | { kind: 'hunter.turn' }
    | { kind: 'game.ended'; winningFaction: string; roles: Record<string, Role> }
    // Room chat is pushed with its full payload inline (unlike every other kind above, which treats
    // its payload as UI-only supplementary data) since GetRoomChatEndpoint's history fetch is only
    // called once on mount -- this is the sole source of live appends after that.
    | { kind: 'chat.room'; senderId: string; text: string; sentAtUtc: string }
    // Lobby kind/payload is unconfirmed against the real hub — server just needs to broadcast
    // this to the room group whenever the lobby aggregate changes (join/leave/kick/ready/
    // settings/roles/cancel); the client always re-fetches full state via GET, so no extra
    // payload fields are required.
    | { kind: 'lobby.updated' }
);
