import { Component, input, output } from '@angular/core';
import { Avatar } from '../avatar/avatar';
import { RoleCard } from '../role-card/role-card';
import { Role } from '../../../core/models/role.model';

/**
 * One entry per row in the mockup's player grid (werewolf_game_interface (2).html's #player-grid).
 * `actionLabel` undefined means no action button renders for that card (e.g. a dead player, or a
 * player who isn't a valid target this turn). `revealedRole` is only set in game-over mode, and
 * takes over the card's content instead of an action button.
 */
export interface PlayerGridEntry {
    playerId: string;
    displayName: string;
    isAlive: boolean;
    isMe: boolean;
    isHost: boolean;
    isReady?: boolean;
    voteCount?: number;
    selected?: boolean;
    actionLabel?: string;
    actionVariant?: 'default' | 'danger' | 'accent';
    actionDisabled?: boolean;
    revealedRole?: Role;
}

@Component({
    selector: 'app-player-grid',
    imports: [Avatar, RoleCard],
    templateUrl: './player-grid.html',
    styleUrl: './player-grid.scss'
})
export class PlayerGrid {
    readonly entries = input.required<PlayerGridEntry[]>();

    readonly action = output<string>();
}
