import { Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

@Component({
    selector: 'app-join-name-prompt',
    imports: [FormsModule, TranslatePipe],
    templateUrl: './join-name-prompt.html',
    styleUrl: './join-name-prompt.scss'
})
export class JoinNamePrompt {
    private readonly translate = inject(TranslateService);

    readonly confirmed = output<string>();

    readonly displayName = signal('');
    readonly errorMessage = signal<string | null>(null);

    confirm(): void {
        const displayName = this.displayName().trim();
        if (!displayName) {
            this.errorMessage.set(this.translate.instant('joinPrompt.errorNeedName'));
            return;
        }
        this.confirmed.emit(displayName);
    }
}
