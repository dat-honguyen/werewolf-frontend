import { Injectable, WritableSignal, signal } from '@angular/core';

export type ToastKind = 'info' | 'success' | 'error';

export interface Toast {
    id: number;
    message: string;
    kind: ToastKind;
}

const AUTO_DISMISS_MS = 4500;

@Injectable({ providedIn: 'root' })
export class ToastService {
    private nextId = 1;
    readonly toasts: WritableSignal<Toast[]> = signal([]);

    show(message: string, kind: ToastKind = 'info'): void {
        const id = this.nextId++;
        this.toasts.update((toasts) => [...toasts, { id, message, kind }]);
        setTimeout(() => this.dismiss(id), AUTO_DISMISS_MS);
    }

    dismiss(id: number): void {
        this.toasts.update((toasts) => toasts.filter((toast) => toast.id !== id));
    }
}
