import { Injectable, WritableSignal, signal } from '@angular/core';

export type ToastKind = 'info' | 'success' | 'error' | 'quit';

export interface Toast {
    id: number;
    message: string;
    kind: ToastKind;
    leaving?: boolean;
}

const AUTO_DISMISS_MS = 4500;
/** A burst of near-simultaneous events (e.g. several players joining a lobby within the same
 * second) fires one toast each -- without a cap, that stack can grow tall enough to cover the
 * header and sidebar content behind it. Dropping the oldest once the cap is hit keeps the stack
 * from ever blocking the rest of the page. */
const MAX_VISIBLE_TOASTS = 3;
/** Matches toast-list.scss's toastSlideOut animation duration -- the toast stays in the array
 * (marked `leaving`) for this long so the exit animation has time to play before the DOM node is
 * actually removed. */
const EXIT_ANIMATION_MS = 200;

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
        this.toasts.update((toasts) =>
            toasts.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast))
        );
        setTimeout(() => {
            this.toasts.update((toasts) => toasts.filter((toast) => toast.id !== id));
        }, EXIT_ANIMATION_MS);
    }
}
