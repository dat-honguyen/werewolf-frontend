import { test, expect } from '@playwright/test';

const PLAYER_NAMES = ['Host', 'Bob', 'Cara', 'Dan', 'Eve'];

test('a started game renders a balanced layout at desktop and mobile widths', async ({
    browser
}) => {
    const contexts = await Promise.all(
        PLAYER_NAMES.map(() => browser.newContext({ viewport: { width: 1440, height: 900 } }))
    );
    const pages = await Promise.all(contexts.map((ctx) => ctx.newPage()));

    try {
        const host = pages[0];
        await host.goto('/');
        await host.getByPlaceholder('Your name').fill(PLAYER_NAMES[0]);
        await host.getByRole('button', { name: 'Gather a New Village' }).click();
        await host.waitForURL(/\/room\/([A-Z0-9]+)/);
        const roomCodeMatch = /\/room\/([A-Z0-9]+)/.exec(host.url());
        const roomCode = roomCodeMatch?.[1] ?? '';
        expect(roomCode).not.toBe('');

        for (let i = 1; i < pages.length; i++) {
            const page = pages[i];
            await page.goto('/');
            await page.getByPlaceholder('Your name').fill(PLAYER_NAMES[i]);
            await page.getByRole('button', { name: 'Join Room' }).click();
            const codeInputs = page.locator('.home-code-char');
            for (let c = 0; c < roomCode.length; c++) {
                await codeInputs.nth(c).fill(roomCode[c]);
            }
            await page.getByRole('button', { name: 'Enter Village' }).click();
            await page.waitForURL(/\/room\/[A-Z0-9]+/);
        }

        for (let i = 1; i < pages.length; i++) {
            await pages[i].getByRole('button', { name: 'Ready Up' }).click();
        }

        await host.getByRole('button', { name: /Start Game|Force Start/ }).click();
        await expect(host.getByText(/NIGHT 1/)).toBeVisible();

        // Regression check: room-shell's 3-column layout used to leave a wall of empty
        // background under &__left/&__center once the game started (short content in a
        // full-viewport-height column) -- the action panel (waiting text, results, etc.)
        // should render inside a bordered card, not float bare over the background.
        await expect(host.locator('.room-action-panel')).toHaveCSS('border-style', /solid/);

        await host.screenshot({
            path: 'e2e/screenshots/in-game-desktop.png',
            fullPage: false
        });

        await host.setViewportSize({ width: 390, height: 844 });
        await host.waitForTimeout(300);

        // Regression check: toast-list used to sit at top-left with a ~22rem max-width,
        // covering the header/logo entirely at phone widths.
        const header = host.locator('.room-shell__header');
        const toasts = host.locator('.toast-list');
        if (await toasts.count()) {
            const headerBox = await header.boundingBox();
            const toastBox = await toasts.boundingBox();
            if (headerBox && toastBox) {
                expect(toastBox.y).toBeGreaterThan(headerBox.y + headerBox.height);
            }
        }

        await host.screenshot({
            path: 'e2e/screenshots/in-game-mobile.png',
            fullPage: false
        });
    } finally {
        await Promise.all(contexts.map((ctx) => ctx.close()));
    }
});
