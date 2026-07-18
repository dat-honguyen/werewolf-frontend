import { Injectable, Signal, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

export type AppLanguage = 'en' | 'vi';

const STORAGE_KEY = 'werewolf.language';
const SUPPORTED: readonly AppLanguage[] = ['en', 'vi'];

/** Thin wrapper around TranslateService: persists the chosen language and
 * picks a sensible default (browser locale, falling back to English) on
 * first load. */
@Injectable({ providedIn: 'root' })
export class LanguageService {
    private readonly translate = inject(TranslateService);

    readonly currentLang: Signal<string | null> = this.translate.currentLang;

    constructor() {
        this.translate.addLangs([...SUPPORTED]);
        this.translate.use(this.resolveInitialLang());
    }

    setLanguage(lang: AppLanguage): void {
        localStorage.setItem(STORAGE_KEY, lang);
        this.translate.use(lang);
    }

    private resolveInitialLang(): AppLanguage {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (this.isSupported(stored)) {
            return stored;
        }
        const browserLang = this.translate.getBrowserLang();
        return this.isSupported(browserLang) ? browserLang : 'en';
    }

    private isSupported(lang: string | null | undefined): lang is AppLanguage {
        return !!lang && (SUPPORTED as readonly string[]).includes(lang);
    }
}
