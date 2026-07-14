import { Component, input, output } from '@angular/core';

@Component({
    selector: 'app-phase-transition',
    imports: [],
    templateUrl: './phase-transition.html',
    styleUrl: './phase-transition.scss'
})
export class PhaseTransition {
    readonly title = input.required<string>();
    readonly durationMs = input(1400);

    readonly dismissed = output<void>();

    onAnimationEnd(): void {
        this.dismissed.emit();
    }
}
