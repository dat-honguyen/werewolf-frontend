import { Component, input } from '@angular/core';

/**
 * Purely decorative, aria-hidden backdrop for the room screen: a haunted-house + graveyard
 * silhouette that's always present (the game's "village" setting), plus a howling-wolf silhouette
 * that only shows during night phases -- so it reads as a phase differentiator, not static
 * decoration. All three SVGs are CC0/public-domain Openclipart silhouettes (see
 * docs/superpowers/specs/2026-07-19-game-feel-polish-design.md for source URLs), recolored to
 * currentColor/var(--glow) so they theme with the rest of the shell, including the 'bloody' theme
 * swap.
 */
@Component({
    selector: 'app-room-backdrop',
    imports: [],
    templateUrl: './room-backdrop.html',
    styleUrl: './room-backdrop.scss'
})
export class RoomBackdrop {
    readonly isNight = input(false);
}
