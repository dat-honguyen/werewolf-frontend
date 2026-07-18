import { Injectable, WritableSignal, signal } from '@angular/core';

export type ToastKind = 'info' | 'success' | 'error' | 'quit';

export interface Toast {
    id: number;
    message: string;
    kind: ToastKind;
}

const AUTO_DISMISS_MS = 4500;
/** A burst of near-simultaneous events (e.g. several players joining a lobby within the same
 * second) fires one toast each -- without a cap, that stack can grow tall enough to cover the
 * header and sidebar content behind it. Dropping the oldest once the cap is hit keeps the stack
 * from ever blocking the rest of the page. */
const MAX_VISIBLE_TOASTS = 3;

@Injectable({ providedIn: 'root' })
export class ToastService {
    private nextId = 1;
    readonly toasts: WritableSignal<Toast[]> = signal([]);

    show(message: string, kind: ToastKind = 'info'): void {
        const id = this.nextId++;
        this.toasts.update((toasts) =>
            [...toasts, { id, message, kind }].slice(-MAX_VISIBLE_TOASTS)
        );
        setTimeout(() => this.dismiss(id), AUTO_DISMISS_MS);
    }

    dismiss(id: number): void {
        this.toasts.update((toasts) => toasts.filter((toast) => toast.id !== id));
    }
}
