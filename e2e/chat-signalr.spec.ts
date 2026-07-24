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

    // Known backend race, not a test flake: the player-grid card count above only reflects
    // Ally's HTTP-fetched lobby state -- it says nothing about whether Ally's `JoinGameRoom`
    // SignalR command has actually been processed yet. The backend acks `JoinGameRoom` as soon as
    // Wolverine durably enqueues it (`opts.Policies.UseDurableLocalQueues()` in
    // CritterConfiguration.cs applies app-wide), *before* JoinGameRoomHandler's
    // AddConnectionToGroup side effect necessarily runs on a background worker. Sending a chat
    // message immediately after the grid updates can race that side effect and broadcast to the
    // room group before Ally's connection is actually a member of it -- Ally then silently never
    // receives it (chat.room has no retry/replay). See GAME_FLOW.md §7's "Known limitation" note
    // for the full writeup and why it isn't fixed at the source yet. This wait is a pragmatic
    // margin against that race, not a guarantee -- if this test starts flaking again, that's the
    // race window growing, not a new bug.
    await host.waitForTimeout(1_000);

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
