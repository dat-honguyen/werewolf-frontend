import { Component, inject } from '@angular/core';
import { ThemeService } from '../../../core/services/theme.service';

@Component({
    selector: 'app-theme-toggle',
    imports: [],
    templateUrl: './theme-toggle.html',
    styleUrl: './theme-toggle.scss'
})
export class ThemeToggle {
    private readonly themeService = inject(ThemeService);

    readonly theme = this.themeService.theme;

    toggle(): void {
        this.themeService.toggle();
    }
}
