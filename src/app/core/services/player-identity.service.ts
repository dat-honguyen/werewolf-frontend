import { Injectable, Signal, WritableSignal, signal } from '@angular/core';

const PLAYER_ID_KEY = 'werewolf.playerId';
const DISPLAY_NAME_KEY = 'werewolf.displayName';
const ACTIVE_ROOM_KEY = 'werewolf.activeRoomCode';

@Injectable({ providedIn: 'root' })
export class PlayerIdentityService {
    private readonly playerIdSignal: WritableSignal<string>;
    private readonly activeRoomCodeSignal: WritableSignal<string | null>;
    readonly displayName: WritableSignal<string>;

    constructor() {
        let playerId = localStorage.getItem(PLAYER_ID_KEY);
        if (!playerId) {
            playerId = crypto.randomUUID();
            localStorage.setItem(PLAYER_ID_KEY, playerId);
        }
        this.playerIdSignal = signal(playerId);
        this.displayName = signal(localStorage.getItem(DISPLAY_NAME_KEY) ?? '');
        this.activeRoomCodeSignal = signal(localStorage.getItem(ACTIVE_ROOM_KEY));
    }

    get playerId(): Signal<string> {
        return this.playerIdSignal;
    }

    /** The room this browser/player last entered and hasn't explicitly left yet -- lets the home
     * screen offer "rejoin" after a closed tab, crashed browser, or lost connection (as opposed to
     * a deliberate quit/leave/cancel, which clears this). */
    get activeRoomCode(): Signal<string | null> {
        return this.activeRoomCodeSignal;
    }

    setDisplayName(displayName: string): void {
        localStorage.setItem(DISPLAY_NAME_KEY, displayName);
        this.displayName.set(displayName);
    }

    setActiveRoom(roomCode: string): void {
        localStorage.setItem(ACTIVE_ROOM_KEY, roomCode);
        this.activeRoomCodeSignal.set(roomCode);
    }

    clearActiveRoom(): void {
        localStorage.removeItem(ACTIVE_ROOM_KEY);
        this.activeRoomCodeSignal.set(null);
    }
}
