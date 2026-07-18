import { defineConfig, devices } from '@playwright/test';

// werewolf-frontend and werewolf (the backend) are checked out as sibling directories -- see
// e2e/start-backend.cjs, which locates the backend repo via that sibling-directory assumption.
// Its startup steps are idempotent (checks health before doing anything, `podman compose up -d`
// and `podman machine start` both no-op if already running), so it's safe to invoke on every
// `npm run e2e` regardless of whether the backend was already up.

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
            // Starts Postgres and the backend if either isn't already up -- see the module
            // comment above. `reuseExistingServer: true` unconditionally: the startup script's
            // own idempotency already handles "already running", and this backend isn't something
            // Playwright should ever kill after the run (unlike the frontend dev server below,
            // other things may depend on it staying up). e2e/start-backend.cjs delegates straight
            // to driver.sh on Linux/CI; on Windows (no shell can exec a `.sh` file, and driver.sh's
            // CRLF line endings break it even under WSL) it runs the equivalent steps directly,
            // starting with `podman machine start` since podman's Postgres runs inside a VM that
            // isn't already up like it is in CI. Runs with the frontend repo as cwd (this file's
            // directory) -- start-backend.cjs locates the werewolf repo itself.
            command: 'node e2e/start-backend.cjs',
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
