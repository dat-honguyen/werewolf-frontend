import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env['CI'],
    retries: process.env['CI'] ? 2 : 0,
    reporter: 'html',
    use: {
        baseURL: 'http://localhost:4200',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure'
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'], channel: 'chrome' }
        }
    ],
    // Uses the "e2e" Angular config (plain HTTP, no self-signed cert) against the
    // backend's plain-HTTP dev port -- see src/environments/environment.e2e.ts and
    // the CORS entry in appsettings.Development.json. The backend itself is NOT
    // started here; run it separately (e.g. the werewolf repo's own driver script)
    // before `npm run e2e`.
    webServer: {
        command: 'npm run start:e2e',
        url: 'http://localhost:4200',
        reuseExistingServer: !process.env['CI'],
        timeout: 120_000
    }
});
