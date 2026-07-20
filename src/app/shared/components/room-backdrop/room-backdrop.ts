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
interface DustMote {
    left: string;
    size: number;
    duration: string;
    delay: string;
}

@Component({
    selector: 'app-room-backdrop',
    imports: [],
    templateUrl: './room-backdrop.html',
    styleUrl: './room-backdrop.scss'
})
export class RoomBackdrop {
    readonly isNight = input(false);

    /** Fixed, hand-picked spread rather than Math.random() in the template -- randomizing on every
     * change-detection pass would restart each mote's drift mid-flight instead of letting it loop
     * smoothly. */
    readonly dustMotes: DustMote[] = [
        { left: '6%', size: 3, duration: '22s', delay: '-2s' },
        { left: '17%', size: 2, duration: '26s', delay: '-14s' },
        { left: '29%', size: 3, duration: '19s', delay: '-9s' },
        { left: '41%', size: 2, duration: '24s', delay: '-4s' },
        { left: '54%', size: 3, duration: '21s', delay: '-17s' },
        { left: '66%', size: 2, duration: '27s', delay: '-11s' },
        { left: '78%', size: 3, duration: '20s', delay: '-6s' },
        { left: '90%', size: 2, duration: '25s', delay: '-19s' }
    ];
}
