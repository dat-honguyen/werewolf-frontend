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
    /** 0-100, percent of the countdown's total duration still remaining. Null hides the progress
     * bar (e.g. RoomShell hasn't got a configured duration to measure against). */
    readonly countdownProgress = input<number | null>(null);
    /** Cosmetic theme for the countdown block -- 'sand' (default, Day Discussion's hourglass) or
     * 'blood' (Day Voting's blood-drop, so the two clocks read as visually distinct phases). */
    readonly countdownVariant = input<'sand' | 'blood'>('sand');
}
