import { mkdirSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { test, expect, Page } from '@playwright/test';
import { createStepper, runTimestamp } from './utils/screenshot';
import { getState, joinRestOfRoom, post, readyUpRestOfRoom, waitForPhase } from './utils/game-api';

const PLAYER_NAMES = ['Host', 'Bob', 'Cara', 'Dan', 'Eve'];

// A small 5-player distribution with exactly one Seer, one Werewolf, one Doctor -- guaranteed
// counts, but *which* real browser page the server hands each role to is still random (decided
// by StartGame), so the "player" this test drives through the UI is discovered after the game
// starts, not chosen up front. Lynching the sole Werewolf on day 1 ends the game immediately
// (Villagers win), keeping the whole lobby-to-game-over journey short enough to review as one
// video.
// Every role gets an explicit count (not just the ones this test cares about) -- the settings
// modal starts pre-filled with its own default distribution for 5 players, and Apply Role
// Distribution submits whatever every row currently shows, so leaving any row untouched would
// carry its default count into the submitted total and blow past the 5-player cap.
const ROLE_DISTRIBUTION: Record<string, number> = {
    Werewolf: 1,
    Seer: 1,
    Doctor: 1,
    Hunter: 0,
    Witch: 0,
    Cupid: 0,
    Tanner: 0,
    Villager: 2
};

test("a player's full journey -- role card, night action, chat, vote, final roles -- recorded on video", async ({
    browser,
    request
}) => {
    test.setTimeout(120_000);

    const videoDir = path.join(__dirname, 'videos', runTimestamp(), 'player-journey');
    mkdirSync(videoDir, { recursive: true });

    const contexts = await Promise.all(
        PLAYER_NAMES.map(() =>
            browser.newContext({
                viewport: { width: 1280, height: 800 },
                recordVideo: { dir: videoDir, size: { width: 1280, height: 800 } }
            })
        )
    );
    const pages = await Promise.all(contexts.map((ctx) => ctx.newPage()));
    const host = pages[0];
    const shoot = createStepper(host, 'player-journey');

    let player: Page | null = null;
    let playerName = '';

    try {
        await host.goto('/');
        await host.getByPlaceholder('Your name').fill(PLAYER_NAMES[0]);
        await host.getByRole('button', { name: 'Gather a New Village' }).click();
        await host.waitForURL(/\/room\/([A-Z0-9]+)/);
        const roomCode = /\/room\/([A-Z0-9]+)/.exec(host.url())?.[1] ?? '';
        expect(roomCode).not.toBe('');
        const hostPlayerId = await host.evaluate(() => localStorage.getItem('werewolf.playerId'));
        expect(hostPlayerId).toBeTruthy();

        await joinRestOfRoom(pages, PLAYER_NAMES, roomCode);

        // Each page's own waitForURL only confirms that page's navigation, not that the lobby
        // aggregate on the server has processed every JoinLobby command yet -- opening Rules &
        // Setup and applying a distribution before the host's view catches up would validate the
        // proposed counts against a stale (too-small) player count and get rejected. Wait for the
        // host's own roster to show everyone first.
        await expect(host.locator('.player-grid__card')).toHaveCount(PLAYER_NAMES.length, {
            timeout: 10_000
        });
        await shoot('all 5 players joined');

        // Configure the role distribution through the real Rules & Setup UI, same as
        // full-game-happy-path.spec.ts, so the guarantee above (exactly one of each) actually
        // holds when the game starts.
        await host.getByRole('button', { name: /Rules & Setup/ }).click();
        for (const [role, count] of Object.entries(ROLE_DISTRIBUTION)) {
            const row = host.locator('.settings-modal__role-row').filter({ hasText: role });
            await row.locator('input[type="number"]').fill(String(count));
        }
        await host.getByRole('button', { name: 'Apply Role Distribution' }).click();
        await host.getByRole('button', { name: 'Close' }).click();
        await shoot('role distribution configured');

        await readyUpRestOfRoom(host, pages, PLAYER_NAMES);
        await host.getByRole('button', { name: /Start Game|Force Start/ }).click();
        await expect(host.locator('.phase-banner__status').getByText(/NIGHT 1/)).toBeVisible();
        await shoot('game started');

        // Match each real browser page to the playerId the server assigned it, then find out
        // which of those five pages actually got the Seer role -- that page is "the player" this
        // test drives through every UI interaction from here on.
        const nameByPlayerId = new Map<string, string>();
        const pageByPlayerId = new Map<string, Page>();
        for (let i = 0; i < pages.length; i++) {
            const id = await pages[i].evaluate(() => localStorage.getItem('werewolf.playerId'));
            expect(id).toBeTruthy();
            nameByPlayerId.set(id!, PLAYER_NAMES[i]);
            pageByPlayerId.set(id!, pages[i]);
        }

        let state = await getState(request, roomCode);
        const seer = state.players.find((p) => p.role === 'Seer')!;
        const werewolf = state.players.find((p) => p.role === 'Werewolf')!;
        const doctor = state.players.find((p) => p.role === 'Doctor');
        expect(seer).toBeTruthy();
        expect(werewolf).toBeTruthy();

        player = pageByPlayerId.get(seer.playerId)!;
        playerName = nameByPlayerId.get(seer.playerId)!;
        const werewolfName = nameByPlayerId.get(werewolf.playerId)!;
        const other = pages.find((p) => p !== player)!;
        const shootPlayer = createStepper(player, `player-journey-${playerName.toLowerCase()}`);
        console.log(`player-view spec: server assigned Seer to "${playerName}"`);

        // 1. Role reveal: tap the identity card to flip it and read the assigned role.
        await player.locator('[class*="identity-grimoire"]').first().click();
        await expect(player.locator('.identity-grimoire__role-text h4')).toHaveText('Seer');
        await shootPlayer('role card flipped: Seer');

        // 2. Night action: click a living player's card to inspect them. Clicking the
        // `.player-grid__action` button submits the inspection immediately -- the real UI has no
        // separate confirm step for a night action (see room-shell.ts's onNightGridAction). The
        // server enforces a fixed turn order within the night (NightChecklist.cs: Cupid ->
        // Werewolf -> Doctor -> Seer -> Witch), so the Werewolf's and Doctor's actions -- both
        // resolved via the API here -- must land *before* the Seer's UI-driven inspect below, or
        // the inspect is rejected as out-of-turn and the phase never advances.
        const villager = state.players.find((p) => p.isAlive && p.role === 'Villager')!;
        await post(request, '/game/werewolf/vote', {
            roomCode,
            playerId: werewolf.playerId,
            targetPlayerId: villager.playerId
        });

        if (doctor) {
            const protectTarget = state.players.find(
                (p) =>
                    p.isAlive && p.playerId !== doctor.playerId && p.playerId !== villager.playerId
            )!;
            await post(request, '/game/doctor/protect', {
                roomCode,
                playerId: doctor.playerId,
                targetPlayerId: protectTarget.playerId
            });
        }

        const inspectTarget = state.players.find((p) => p.isAlive && p.playerId !== seer.playerId)!;
        const inspectTargetName = nameByPlayerId.get(inspectTarget.playerId)!;
        await player
            .locator('.player-grid__card')
            .filter({ hasText: inspectTargetName })
            .getByRole('button', { name: 'Inspect' })
            .click();
        await expect(player.locator('.room-action-panel__result')).toBeVisible({
            timeout: 10_000
        });
        await shootPlayer(`seer inspected ${inspectTargetName}`);

        state = await waitForPhase(request, roomCode, (s) => s.phase !== 'Night', 15_000);
        expect(state.phase).toBe('DayDiscussion');
        await shootPlayer('day discussion begins');

        // 3. Chat: send and receive a live Town Square message over SignalR.
        await player.locator('input[name="townMessage"]').fill('I have a suspicion...');
        await player.locator('input[name="townMessage"]').press('Enter');
        await expect(other.getByText('I have a suspicion...')).toBeVisible({ timeout: 10_000 });

        await other.locator('input[name="townMessage"]').fill('Do tell!');
        await other.locator('input[name="townMessage"]').press('Enter');
        await expect(player.getByText('Do tell!')).toBeVisible({ timeout: 10_000 });
        await shootPlayer('chat exchanged');

        // 4. Day vote: click the Werewolf's card to select them, then click Submit Vote to cast
        // it -- selecting a card only stages the choice (room-shell.ts's onGridAction), the
        // Submit Vote button in the action panel is what actually calls the vote API.
        await post(request, '/game/voting/advance', { roomCode, requestedBy: hostPlayerId! });
        state = await waitForPhase(request, roomCode, (s) => s.phase === 'DayVoting');

        await player
            .locator('.player-grid__card')
            .filter({ hasText: werewolfName })
            .getByRole('button', { name: 'Vote' })
            .click();
        await expect(
            player.locator('.player-grid__card').filter({ hasText: werewolfName })
        ).toHaveClass(/player-grid__card--selected/);
        await shootPlayer(`${werewolfName} selected for lynching`);

        const voteResponse = player.waitForResponse((res) =>
            res.url().endsWith('/api/v1/game/vote')
        );
        await player.getByRole('button', { name: 'Submit Vote' }).click();
        expect((await voteResponse).ok()).toBeTruthy();

        // Every other living player also votes for the Werewolf via the same API the UI's Submit
        // Vote button calls, so the lynch actually resolves.
        for (const p of state.players.filter((p) => p.isAlive && p.playerId !== seer.playerId)) {
            await post(request, '/game/vote', {
                roomCode,
                voterPlayerId: p.playerId,
                targetPlayerId: werewolf.playerId
            });
        }

        state = await waitForPhase(request, roomCode, (s) => s.phase === 'GameOver', 15_000);
        expect(state.result?.winningFaction).toBe('Villagers');
        await shootPlayer('villagers win');

        // 5. Final reveal: every player's true role is shown on their card, including the
        // player's own (Seer) and the lynched Werewolf's.
        await expect(player.locator('.player-grid__reveal')).toHaveCount(PLAYER_NAMES.length);
        await expect(
            player
                .locator('.player-grid__card')
                .filter({ hasText: playerName })
                .locator('.role-card__title')
        ).toHaveText('Seer');
        await expect(
            player
                .locator('.player-grid__card')
                .filter({ hasText: werewolfName })
                .locator('.role-card__title')
        ).toHaveText('Werewolf');
        await shootPlayer('final roles revealed');

        // 6. Full game log: opens scrolled to the most recent entry (the actual win, not the
        // wall of role-assignment lines from the start of the game).
        await player.getByRole('button', { name: 'View full game log' }).click();
        const logList = player.locator('.room-action-panel__log');
        await expect(logList).toBeVisible();
        await expect(logList.locator('li').last()).toBeVisible();
        await shootPlayer('full game log opened');
    } finally {
        const videos = pages.map((p) => p.video());
        await Promise.all(contexts.map((ctx) => ctx.close()));

        // Keep only the recording of the page the test actually drove as "the player" -- the
        // other four pages were only ever automated via the API in this spec, so their video is
        // just an idle lobby/night screen and not worth keeping.
        const playerIndex = player ? pages.indexOf(player) : -1;
        const savedPaths = await Promise.all(
            videos.map((v) => (v ? v.path() : Promise.resolve(undefined)))
        );
        for (let i = 0; i < savedPaths.length; i++) {
            const savedPath = savedPaths[i];
            if (!savedPath) {
                continue;
            }
            if (i === playerIndex) {
                const friendlyPath = path.join(videoDir, `${playerName || 'player'}-journey.webm`);
                renameSync(savedPath, friendlyPath);
                console.log(`player-view recording saved to ${friendlyPath}`);
            } else {
                unlinkSync(savedPath);
            }
        }
    }
});
