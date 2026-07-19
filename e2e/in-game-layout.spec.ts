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

        // `Start Game`'s disabled state (room-shell.ts's canStartGame()) is gated on the HOST's
        // own locally-cached view of every player's isReady flag, which only updates via a
        // lobby.updated SignalR push -> GET /api/v1/lobby refetch (see game-state.service.ts).
        // That push can race a given page's hub subscription during a fast join burst -- so after
        // each Ready Up click, wait for it to actually land in the HOST's own view (not just the
        // clicking page's own button label) before moving on, or the host's Start Game stays
        // disabled forever and the test hangs waiting for a click that's a no-op.
        for (let i = 1; i < pages.length; i++) {
            await pages[i].getByRole('button', { name: 'Ready Up' }).click();
            const playerRow = host
                .locator('.player-grid__card')
                .filter({ has: host.locator('.player-grid__name', { hasText: PLAYER_NAMES[i] }) });
            await expect(playerRow.locator('.player-grid__meta')).toContainText('• Ready', {
                timeout: 10_000
            });
        }
        await shoot('all players ready');

        await host.getByRole('button', { name: /Start Game|Force Start/ }).click();
        await expect(host.locator('.phase-banner__status').getByText(/NIGHT 1/)).toBeVisible();
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

        // Regression check: the shell used to be pinned to `height: 100vh; overflow: hidden`,
        // which forced &__left/&__center to stretch (and get vertically centered) to fill the
        // full viewport regardless of how short their real content was -- the visible symptom the
        // redesign was fixing. It's `min-height: 100vh` with no clipping now, so a viewport
        // shorter than the actual content must let the page grow/scroll instead of clipping it.
        await host.setViewportSize({ width: 1440, height: 400 });
        await host.waitForTimeout(300);
        const shortViewportScrollHeight = await host.evaluate(
            () => document.documentElement.scrollHeight
        );
        expect(shortViewportScrollHeight).toBeGreaterThan(400);
        await shoot('short desktop viewport scrolls instead of clipping');
        await host.setViewportSize({ width: 1440, height: 900 });

        // Regression check: the roster (&__left) and chat (&__chat) columns now stick under the
        // header on desktop -- rather than the old behavior of stretching/centering their content
        // inside a column forced to the full viewport height.
        await expect(host.locator('.room-shell__left')).toHaveCSS('position', 'sticky');
        await expect(host.locator('.room-shell__chat')).toHaveCSS('position', 'sticky');

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

        // Regression check: sticky positioning is desktop-only -- below the 900px breakpoint the
        // grid collapses to one column, so &__left/&__chat must fall back to static (a sticky
        // roster/chat on a single-column mobile page would pin itself over the center content).
        await expect(host.locator('.room-shell__left')).toHaveCSS('position', 'static');
        await expect(host.locator('.room-shell__chat')).toHaveCSS('position', 'static');

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
