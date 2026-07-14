import { Component, inject } from '@angular/core';
import { ToastService } from '../../../core/services/toast.service';

@Component({
    selector: 'app-toast-list',
    imports: [],
    templateUrl: './toast-list.html',
    styleUrl: './toast-list.scss'
})
export class ToastList {
    private readonly toastService = inject(ToastService);

    readonly toasts = this.toastService.toasts;

    dismiss(id: number): void {
        this.toastService.dismiss(id);
    }
}
