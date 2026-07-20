import { test, expect } from '@playwright/test';
import { joinRestOfRoom } from './utils/game-api';

const PLAYER_NAMES = ['Host', 'Ally'];

// Regression test for moving Town Square chat off `POST /api/v1/game/chat/room` and onto the
// SignalR hub (send_room_chat_message). Runs entirely in the lobby -- no game needs to start --
// since SendRoomChatMessage appends to LobbyState, not GameState.
test('Town Square chat is sent and received over SignalR, not HTTP', async ({ browser }) => {
    const contexts = await Promise.all(PLAYER_NAMES.map(() => browser.newContext()));
    const pages = await Promise.all(contexts.map((ctx) => ctx.newPage()));
    const [host, ally] = pages;

    // Regression guard: chat must not round-trip through the old REST endpoint.
    const chatHttpRequests: string[] = [];
    for (const page of pages) {
        page.on('request', (req) => {
            if (req.url().endsWith('/api/v1/game/chat/room') && req.method() === 'POST') {
                chatHttpRequests.push(req.url());
            }
        });
    }

    await host.goto('/');
    await host.getByPlaceholder('Your name').fill(PLAYER_NAMES[0]);
    await host.getByRole('button', { name: 'Gather a New Village' }).click();
    await host.waitForURL(/\/room\/([A-Z0-9]+)/);
    const roomCode = /\/room\/([A-Z0-9]+)/.exec(host.url())?.[1] ?? '';
    expect(roomCode).not.toBe('');

    await joinRestOfRoom(pages, PLAYER_NAMES, roomCode);
    await expect(host.locator('.player-grid__card')).toHaveCount(PLAYER_NAMES.length, {
        timeout: 10_000
    });

    await host.locator('input[name="townMessage"]').fill('Anyone here?');
    await host.locator('input[name="townMessage"]').press('Enter');
    await expect(ally.getByText('Anyone here?')).toBeVisible({ timeout: 10_000 });

    await ally.locator('input[name="townMessage"]').fill('Just joined!');
    await ally.locator('input[name="townMessage"]').press('Enter');
    await expect(host.getByText('Just joined!')).toBeVisible({ timeout: 10_000 });

    expect(chatHttpRequests).toEqual([]);

    for (const ctx of contexts) {
        await ctx.close();
    }
});
