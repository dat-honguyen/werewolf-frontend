import { test, expect } from '@playwright/test';
import { createStepper } from './utils/screenshot';

const PLAYER_NAMES = ['Host', 'Bob', 'Cara', 'Dan', 'Eve'];

test('a started game renders a balanced layout at desktop and mobile widths', async ({
    browser
}) => {
    const contexts = await Promise.all(
        PLAYER_NAMES.map(() => browser.newContext({ viewport: { width: 1440, height: 900 } }))
    );
    const pages = await Promise.all(contexts.map((ctx) => ctx.newPage()));
    const host = pages[0];
    const shoot = createStepper(host, 'in-game-layout');

    try {
        await host.goto('/');
        await host.getByPlaceholder('Your name').fill(PLAYER_NAMES[0]);
        await host.getByRole('button', { name: 'Gather a New Village' }).click();
        await host.waitForURL(/\/room\/([A-Z0-9]+)/);
        const roomCodeMatch = /\/room\/([A-Z0-9]+)/.exec(host.url());
        const roomCode = roomCodeMatch?.[1] ?? '';
        expect(roomCode).not.toBe('');
        await shoot('room created');

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
        await shoot('all players joined');

        for (let i = 1; i < pages.length; i++) {
            await pages[i].getByRole('button', { name: 'Ready Up' }).click();
        }
        await shoot('all players ready');

        await host.getByRole('button', { name: /Start Game|Force Start/ }).click();
        await expect(host.getByText(/NIGHT 1/)).toBeVisible();
        await shoot('game started (role reveal)');

        // Reveals the host's role card, which also flips GameStateService.currentView() from
        // 'role-reveal' to 'night' -- see room-shell's phase-announcement effect, which only then
        // adds the "Night has fallen" system chat message this step's screenshot should show.
        await host
            .locator('[class*="identity-grimoire"]')
            .first()
            .click({ timeout: 2000 })
            .catch(() => {});
        await host.waitForTimeout(500);
        await shoot('night view with system chat message');

        // Regression check: room-shell's 3-column layout used to leave a wall of empty
        // background under &__left/&__center once the game started (short content in a
        // full-viewport-height column) -- the action panel (waiting text, results, etc.)
        // should render inside a bordered card, not float bare over the background.
        await expect(host.locator('.room-action-panel')).toHaveCSS('border-style', /solid/);

        // Regression check: 640-900px is the range where &__viewport's grid has already
        // collapsed to a single column (<= 900px) but &player-grid hasn't yet dropped to its own
        // single-column layout (<= 640px). &__center had `min-height: 0` unconditionally, which
        // -- only in a single-column *implicit-row* grid, not the desktop 3-column one -- collapsed
        // the whole column (banner, player grid, action panel) to 0px height, silently overlapping
        // &__chat below it instead of pushing it down. The DOM content was all still there and
        // correct; only its layout box collapsed, so this needs a real height assertion, not a
        // visibility/text check.
        await host.setViewportSize({ width: 663, height: 1000 });
        await host.waitForTimeout(300);
        const centerBox = await host.locator('.room-shell__center').boundingBox();
        expect(centerBox?.height ?? 0).toBeGreaterThan(100);
        await shoot('tablet viewport (640-900px)');

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
        await shoot('mobile viewport');

        await host.setViewportSize({ width: 1440, height: 900 });
    } finally {
        await Promise.all(contexts.map((ctx) => ctx.close()));
    }
});
