import { Component, inject, input, output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

@Component({
    selector: 'app-confirm-dialog',
    imports: [],
    templateUrl: './confirm-dialog.html',
    styleUrl: './confirm-dialog.scss'
})
export class ConfirmDialog {
    private readonly translate = inject(TranslateService);

    readonly title = input('Are you sure?');
    readonly message = input('');
    readonly confirmLabel = input<string | null>(null);
    readonly cancelLabel = input<string | null>(null);

    readonly confirmed = output<void>();
    readonly cancelled = output<void>();

    readonly resolvedConfirmLabel = () =>
        this.confirmLabel() ?? this.translate.instant('confirmDialog.defaultConfirm');
    readonly resolvedCancelLabel = () =>
        this.cancelLabel() ?? this.translate.instant('confirmDialog.defaultCancel');
}
