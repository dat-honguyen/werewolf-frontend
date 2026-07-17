import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Runs once in the main process before any worker starts (see playwright.config.ts's
 * `globalSetup`) -- computes one timestamp for the whole run and hands it to every worker
 * (which may be separate processes, so an in-memory value wouldn't reach them) via a file next
 * to this one. See e2e/utils/screenshot.ts for the reader side.
 */
export default function globalSetup(): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    mkdirSync(path.join(__dirname, 'screenshots', timestamp), { recursive: true });
    writeFileSync(path.join(__dirname, '.run-timestamp'), timestamp);
}
