import { Component, inject } from '@angular/core';
import { LanguageService, AppLanguage } from '../../../core/services/language.service';

@Component({
    selector: 'app-language-switch',
    templateUrl: './language-switch.html',
    styleUrl: './language-switch.scss'
})
export class LanguageSwitch {
    private readonly language = inject(LanguageService);

    readonly currentLang = this.language.currentLang;

    select(lang: AppLanguage): void {
        this.language.setLanguage(lang);
    }

    toggle(): void {
        this.select(this.currentLang() === 'en' ? 'vi' : 'en');
    }
}
