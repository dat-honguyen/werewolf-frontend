import { Component, input, output } from '@angular/core';

@Component({
    selector: 'app-toggle-switch',
    templateUrl: './toggle-switch.html',
    styleUrl: './toggle-switch.scss'
})
export class ToggleSwitch {
    readonly checked = input(false);
    readonly disabled = input(false);
    readonly label = input<string | null>(null);
    readonly checkedChange = output<boolean>();

    toggle(): void {
        if (this.disabled()) {
            return;
        }
        this.checkedChange.emit(!this.checked());
    }
}
