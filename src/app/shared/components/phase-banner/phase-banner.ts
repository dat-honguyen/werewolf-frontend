import { Component, input } from '@angular/core';

/** The mockup's status banner + countdown clock (werewolf_game_interface (2).html's #phase-banner). */
@Component({
    selector: 'app-phase-banner',
    imports: [],
    templateUrl: './phase-banner.html',
    styleUrl: './phase-banner.scss'
})
export class PhaseBanner {
    readonly icon = input.required<string>();
    readonly status = input.required<string>();
    readonly instruction = input.required<string>();
    readonly countdown = input<string | null>(null);
    readonly countdownLabel = input('Time left');
    readonly countdownExpired = input(false);
}
