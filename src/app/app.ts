import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/services/theme.service';
import { ThemeToggle } from './shared/components/theme-toggle/theme-toggle';

@Component({
    selector: 'app-root',
    imports: [RouterOutlet, ThemeToggle],
    templateUrl: './app.html',
    styleUrl: './app.scss'
})
export class App {
    // Injected so ThemeService's constructor (which applies the persisted theme to <html>) runs
    // as soon as the app boots, not lazily on first use elsewhere.
    private readonly themeService = inject(ThemeService);
}
