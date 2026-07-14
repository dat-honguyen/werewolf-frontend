import { Component, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'app-join-name-prompt',
    imports: [FormsModule],
    templateUrl: './join-name-prompt.html',
    styleUrl: './join-name-prompt.scss'
})
export class JoinNamePrompt {
    readonly confirmed = output<string>();

    readonly displayName = signal('');
    readonly errorMessage = signal<string | null>(null);

    confirm(): void {
        const displayName = this.displayName().trim();
        if (!displayName) {
            this.errorMessage.set('Enter a display name to join.');
            return;
        }
        this.confirmed.emit(displayName);
    }
}
