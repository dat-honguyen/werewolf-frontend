import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

// werewolf-frontend and werewolf (the backend) are checked out as sibling directories -- see
// werewolf's .claude/skills/run-werewolf/driver.sh, the same script the run-werewolf agent skill
// uses. `up` is idempotent (checks its own PID file / port before doing anything, and `podman
// compose up -d` no-ops on an already-running Postgres container), so it's safe to invoke on
// every `npm run e2e` regardless of whether the backend was already running.
const WEREWOLF_BACKEND_ROOT = path.resolve(__dirname, '../werewolf');

export default defineConfig({
    testDir: './e2e',
    globalSetup: './e2e/global-setup.ts',
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
    // the CORS entry in appsettings.Development.json.
    webServer: [
        {
            // Starts Postgres (via podman compose) and the backend if either isn't already up --
            // see the comment on WEREWOLF_BACKEND_ROOT above. `reuseExistingServer: true`
            // unconditionally: driver.sh's own idempotency already handles "already running", and
            // this backend isn't something Playwright should ever kill after the run (unlike the
            // frontend dev server below, other things may depend on it staying up).
            command: '.claude/skills/run-werewolf/driver.sh up',
            cwd: WEREWOLF_BACKEND_ROOT,
            url: 'http://localhost:5080/health/ready',
            reuseExistingServer: true,
            timeout: 180_000
        },
        {
            command: 'npm run start:e2e',
            url: 'http://localhost:4200',
            reuseExistingServer: !process.env['CI'],
            timeout: 120_000
        }
    ]
});
