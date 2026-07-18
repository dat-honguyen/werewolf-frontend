import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';

let cachedRunTimestamp: string | null = null;

function runTimestamp(): string {
    cachedRunTimestamp ??= readFileSync(
        path.join(__dirname, '..', '.run-timestamp'),
        'utf-8'
    ).trim();
    return cachedRunTimestamp;
}

/**
 * Returns a `shoot(label)` function that screenshots `page` into
 * `e2e/screenshots/<run-timestamp>/<testName>/<NN-label>.png`, numbered in call order. One run
 * (however many spec files/tests it includes) shares a single timestamp folder -- see
 * e2e/global-setup.ts -- so every step from every test in that run is easy to find and compare
 * side by side after the fact instead of overwriting a single fixed filename each time.
 */
export function createStepper(page: Page, testName: string): (label: string) => Promise<void> {
    let step = 0;
    const dir = path.join(__dirname, '..', 'screenshots', runTimestamp(), testName);
    mkdirSync(dir, { recursive: true });

    return async (label: string) => {
        step += 1;
        // Strips characters Windows/NTFS treats specially in filenames -- a literal `:` in
        // particular doesn't just get rejected, it silently splits the name into an NTFS
        // alternate data stream (`06-night-1` + a hidden `:...png` stream), leaving a visible
        // 0-byte file with no extension and the actual screenshot bytes stashed somewhere no
        // image viewer will find them.
        const safeLabel = label
            .replace(/[:*?"<>|]/g, '')
            .replace(/\s+/g, '-')
            .toLowerCase();
        const fileName = `${String(step).padStart(2, '0')}-${safeLabel}.png`;
        await page.screenshot({ path: path.join(dir, fileName), fullPage: false });
    };
}
