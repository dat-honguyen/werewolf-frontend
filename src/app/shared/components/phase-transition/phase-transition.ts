import { Component, computed, input, output } from '@angular/core';
import { moonPhaseFor } from '../../../core/utils/moon-phase.util';

@Component({
    selector: 'app-phase-transition',
    imports: [],
    templateUrl: './phase-transition.html',
    styleUrl: './phase-transition.scss'
})
export class PhaseTransition {
    readonly title = input.required<string>();
    readonly nightNumber = input<number | null>(null);
    readonly durationMs = input(1400);

    readonly dismissed = output<void>();

    readonly moonPhase = computed(() => moonPhaseFor(this.nightNumber()));

    onAnimationEnd(): void {
        this.dismissed.emit();
    }
}
