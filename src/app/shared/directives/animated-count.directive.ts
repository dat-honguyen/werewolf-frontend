import { Directive, ElementRef, effect, inject, input } from '@angular/core';

const TWEEN_DURATION_MS = 450;

/** Tweens an element's text content from its previous numeric value to a new one whenever the
 * bound value changes, instead of the number snapping instantly. Applied as an attribute
 * directive (not a wrapping component) so it stays on the caller's own element and keeps
 * whatever CSS already targets it -- a child component's own template markup wouldn't pick up a
 * parent's descendant selector under Angular's emulated view encapsulation. */
@Directive({
    selector: '[appAnimatedCount]'
})
export class AnimatedCount {
    private readonly el = inject(ElementRef<HTMLElement>);
    private displayedValue: number | null = null;
    private frameHandle: number | null = null;

    readonly appAnimatedCount = input.required<number>();

    private readonly reducedMotion =
        typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    constructor() {
        effect(() => {
            const target = this.appAnimatedCount();
            const from = this.displayedValue ?? target;
            this.displayedValue = target;

            if (this.reducedMotion || from === target) {
                this.render(target);
                return;
            }

            this.tween(from, target);
        });
    }

    private tween(from: number, to: number): void {
        if (this.frameHandle !== null) {
            cancelAnimationFrame(this.frameHandle);
        }
        const start = performance.now();
        const step = (now: number): void => {
            const progress = Math.min(1, (now - start) / TWEEN_DURATION_MS);
            const eased = 1 - (1 - progress) * (1 - progress);
            this.render(Math.round(from + (to - from) * eased));
            if (progress < 1) {
                this.frameHandle = requestAnimationFrame(step);
            } else {
                this.frameHandle = null;
            }
        };
        this.frameHandle = requestAnimationFrame(step);
    }

    private render(value: number): void {
        this.el.nativeElement.textContent = String(value);
    }
}
