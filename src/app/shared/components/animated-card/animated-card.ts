import { Component, input } from '@angular/core';

@Component({
    selector: 'app-animated-card',
    imports: [],
    templateUrl: './animated-card.html',
    styleUrl: './animated-card.scss'
})
export class AnimatedCard {
    readonly flipped = input(false);
    readonly glowing = input(false);
    readonly disabled = input(false);
    readonly glowColor = input<string>('var(--color-gold-glow)');
}
