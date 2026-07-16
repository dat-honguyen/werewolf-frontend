import { Injectable, effect, signal } from '@angular/core';

export type ThemeName = 'classic' | 'bloody';

const STORAGE_KEY = 'werewolf.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
    readonly theme = signal<ThemeName>(this.readStored());

    constructor() {
        effect(() => {
            const theme = this.theme();
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem(STORAGE_KEY, theme);
        });
    }

    toggle(): void {
        this.theme.set(this.theme() === 'bloody' ? 'classic' : 'bloody');
    }

    private readStored(): ThemeName {
        return localStorage.getItem(STORAGE_KEY) === 'bloody' ? 'bloody' : 'classic';
    }
}
