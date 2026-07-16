import { Component, input, output } from '@angular/core';

@Component({
    selector: 'app-confirm-dialog',
    imports: [],
    templateUrl: './confirm-dialog.html',
    styleUrl: './confirm-dialog.scss'
})
export class ConfirmDialog {
    readonly title = input('Are you sure?');
    readonly message = input('');
    readonly confirmLabel = input('Confirm');
    readonly cancelLabel = input('Cancel');

    readonly confirmed = output<void>();
    readonly cancelled = output<void>();
}
