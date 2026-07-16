import { Component, input, output } from '@angular/core';
import { Avatar } from '../avatar/avatar';

@Component({
    selector: 'app-player-card',
    imports: [Avatar],
    templateUrl: './player-card.html',
    styleUrl: './player-card.scss'
})
export class PlayerCard {
    readonly displayName = input.required<string>();
    readonly isReady = input<boolean | null>(null);
    readonly isAlive = input(true);
    readonly isDying = input(false);
    readonly isSelectable = input(false);
    readonly isSelected = input(false);
    readonly voteCount = input(0);

    readonly picked = output<void>();
}
