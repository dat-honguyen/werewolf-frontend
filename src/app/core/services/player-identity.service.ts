import { Injectable, Signal, WritableSignal, signal } from '@angular/core';

const PLAYER_ID_KEY = 'werewolf.playerId';
const DISPLAY_NAME_KEY = 'werewolf.displayName';

@Injectable({ providedIn: 'root' })
export class PlayerIdentityService {
    private readonly playerIdSignal: WritableSignal<string>;
    readonly displayName: WritableSignal<string>;

    constructor() {
        let playerId = localStorage.getItem(PLAYER_ID_KEY);
        if (!playerId) {
            playerId = crypto.randomUUID();
            localStorage.setItem(PLAYER_ID_KEY, playerId);
        }
        this.playerIdSignal = signal(playerId);
        this.displayName = signal(localStorage.getItem(DISPLAY_NAME_KEY) ?? '');
    }

    get playerId(): Signal<string> {
        return this.playerIdSignal;
    }

    setDisplayName(displayName: string): void {
        localStorage.setItem(DISPLAY_NAME_KEY, displayName);
        this.displayName.set(displayName);
    }
}
