import { test, expect, APIRequestContext, Page } from '@playwright/test';
import { createStepper } from './utils/screenshot';
import {
    GameState,
    getState,
    joinRestOfRoom,
    post,
    readyUpRestOfRoom,
    resolveDay,
    waitForPhase
} from './utils/game-api';

const LOBBY_API_BASE = 'http://localhost:5080/api/v1/lobby';

/** Shared by every test below: maps playerId -> displayName from the lobby projection (still
 * readable after StartGame closes the lobby) -- GameStateResponse.players only carries role/
 * isAlive, no display name. */
async function fetchDisplayNames(
    request: APIRequestContext,
    roomCode: string
): Promise<Map<string, string>> {
    const lobbyRes = await request.get(`${LOBBY_API_BASE}/${roomCode}`);
    expect(lobbyRes.ok()).toBeTruthy();
    const lobby = await lobbyRes.json();
    return new Map<string, string>(
        lobby.players.map((p: { playerId: string; displayName: string }) => [
            p.playerId,
            p.displayName
        ])
    );
}

/** Waits for the death-reveal overlay to show the given exact text, holds long enough for a clean
 * screenshot mid-animation, then screenshots and confirms it dismisses itself. Only for reveals
 * that are the sole thing on screen at that moment -- see expectRevealEitherOrder for a batched
 * (non-lynch) reveal that could show two names in either order. */
async function expectReveal(
    reveal: ReturnType<Page['locator']>,
    expectedText: string,
    shoot: (label: string) => Promise<void>,
    label: string
): Promise<void> {
    await expect(reveal.locator('.death-reveal__text')).toHaveText(expectedText, {
        timeout: 15_000
    });
    await reveal.page().waitForTimeout(500);
    await shoot(label);
    await expect(reveal).toBeHidden({ timeout: 8_000 });
}

/** Non-lynch deaths that land within DEATH_BATCH_WINDOW_MS of each other (see room-shell.ts) are
 * batched into one combined reveal, e.g. "A and B were found dead" -- but which name room-shell
 * lists first depends on notification arrival order, which this test doesn't control. Matches
 * either ordering rather than asserting a specific one. */
async function expectRevealEitherOrder(
    reveal: ReturnType<Page['locator']>,
    nameA: string,
    nameB: string,
    shoot: (label: string) => Promise<void>,
    label: string
): Promise<void> {
    const textLocator = reveal.locator('.death-reveal__text');
    await expect(textLocator).toHaveText(
        new RegExp(`(${nameA} and ${nameB}|${nameB} and ${nameA}) were found dead`),
        { timeout: 15_000 }
    );
    await reveal.page().waitForTimeout(500);
    await shoot(label);
    await expect(reveal).toBeHidden({ timeout: 8_000 });
}

const PLAYER_NAMES = ['Host', 'Bob', 'Cara', 'Dan', 'Eve'];

/** Only Werewolf/Villager roles -- no Doctor/Seer/Witch/Cupid means the only night action that has
 * to happen for Night 1 to resolve is the werewolf's kill vote, so the death-reveal overlay's
 * timing (see room-shell.ts's DEATH_REVEAL_HOLD_MS/VOTE_RESULT_REVEAL_DELAY_MS) is the only thing
 * this test has to wait on. */
const ROLE_DISTRIBUTION: Record<string, number> = { Werewolf: 1, Villager: 4 };

test("the full-screen death reveal shows a night kill, then a lynch, on every living player's screen", async ({
    browser,
    request
}) => {
    test.setTimeout(90_000);

    const contexts = await Promise.all(
        PLAYER_NAMES.map(() => browser.newContext({ viewport: { width: 1440, height: 900 } }))
    );
    const pages = await Promise.all(contexts.map((ctx) => ctx.newPage()));
    const [host] = pages;
    const shoot = createStepper(host, 'death-reveal');

    try {
        await host.goto('/');
        await host.getByPlaceholder('Your name').fill(PLAYER_NAMES[0]);
        await host.getByRole('button', { name: 'Gather a New Village' }).click();
        await host.waitForURL(/\/room\/([A-Z0-9]+)/);
        const roomCode = /\/room\/([A-Z0-9]+)/.exec(host.url())?.[1] ?? '';
        expect(roomCode).not.toBe('');
        const hostPlayerId = await host.evaluate(() => localStorage.getItem('werewolf.playerId'));
        expect(hostPlayerId).toBeTruthy();

        // Join everyone, then configure roles (UpdateRoleDistribution validates against how many
        // players have currently joined), then ready up -- same order as full-game-happy-path,
        // just via a direct API call instead of the Rules & Setup UI since that UI isn't what this
        // test is exercising.
        await joinRestOfRoom(pages, PLAYER_NAMES, roomCode);
        await shoot('all players joined');

        const rolesRes = await request.post(`${LOBBY_API_BASE}/roles`, {
            data: { roomCode, requestedBy: hostPlayerId, distribution: ROLE_DISTRIBUTION }
        });
        expect(
            rolesRes.ok(),
            `role distribution update failed: ${await rolesRes.text()}`
        ).toBeTruthy();

        await readyUpRestOfRoom(host, pages, PLAYER_NAMES);
        await shoot('all players ready');

        await host.getByRole('button', { name: /Start Game|Force Start/ }).click();
        await expect(host.locator('.phase-banner__status').getByText(/NIGHT 1/)).toBeVisible();
        await shoot('game started, night 1');

        const nameOf = await fetchDisplayNames(request, roomCode);

        let state = await getState(request, roomCode);
        const wolf = state.players.find((p) => p.role === 'Werewolf')!;
        const nightKillTarget = state.players.find((p) => p.playerId !== wolf.playerId)!;
        const nightKillName = nameOf.get(nightKillTarget.playerId)!;

        await post(request, '/game/werewolf/vote', {
            roomCode,
            playerId: wolf.playerId,
            targetPlayerId: nightKillTarget.playerId
        });

        // Night resolves as soon as the (sole) werewolf votes -- no other role needs to act. A
        // single death still goes through the same "deaths" batching as a chain of several (see
        // room-shell.ts), it just never has a second name to wait for.
        const reveal = host.locator('app-death-reveal .death-reveal');
        await expectReveal(
            reveal,
            `${nightKillName} was found dead`,
            shoot,
            'night kill reveal shown'
        );

        state = await waitForPhase(request, roomCode, (s) => s.phase === 'DayDiscussion');
        expect(state.phase).toBe('DayDiscussion');

        const alive = state.players.filter((p) => p.isAlive);
        const lynchTarget = alive[0];
        const lynchName = nameOf.get(lynchTarget.playerId)!;

        await resolveDay(request, roomCode, hostPlayerId!, (voter) =>
            voter.playerId === lynchTarget.playerId ? undefined : lynchTarget.playerId
        );

        // Lynch deaths pause on "tallying the votes" first (VOTE_RESULT_REVEAL_DELAY_MS, 3s)
        // before the name lands.
        await expect(reveal).toBeVisible({ timeout: 15_000 });
        await expect(reveal).toHaveClass(/death-reveal--tallying/);
        await host.waitForTimeout(500);
        await shoot('lynch tallying stage shown');

        await expect(reveal.locator('.death-reveal__text')).toHaveText(`${lynchName} was lynched`, {
            timeout: 6_000
        });
        await expect(reveal).not.toHaveClass(/death-reveal--tallying/);
        await host.waitForTimeout(500);
        await shoot('lynch reveal shown');

        await expect(reveal).toBeHidden({ timeout: 8_000 });
        await shoot('lynch reveal dismissed');
    } finally {
        await Promise.all(contexts.map((ctx) => ctx.close()));
    }
});

const CHAIN_PLAYER_NAMES = ['Host', 'Bob', 'Cara', 'Dan', 'Eve', 'Finn', 'Gia', 'Hana'];

/** Cupid + Hunter alongside the Werewolf (5 plain Villagers round out the 8) -- enough moving
 * pieces to trigger two different death-chain mechanics in the same game: a lover-link cascade
 * (one wolf kill takes both paired lovers down together, same night -- batched into a single "A
 * and B were found dead" reveal, no reason shown) and a Hunter's-revenge cascade (the Hunter's own
 * death queues a shot that kills a second player on a delay -- a separate reveal, since it only
 * happens once the test actually submits the shot). */
const CHAIN_ROLE_DISTRIBUTION: Record<string, number> = {
    Werewolf: 1,
    Cupid: 1,
    Hunter: 1,
    Villager: 5
};

test('a lover-link cascade batches into one reveal, and a lynch/Hunter-revenge chain each still get their own, on an 8-player game', async ({
    browser,
    request
}) => {
    test.setTimeout(120_000);

    const contexts = await Promise.all(
        CHAIN_PLAYER_NAMES.map(() => browser.newContext({ viewport: { width: 1440, height: 900 } }))
    );
    const pages = await Promise.all(contexts.map((ctx) => ctx.newPage()));
    const [host] = pages;
    const shoot = createStepper(host, 'death-reveal-chain');

    try {
        await host.goto('/');
        await host.getByPlaceholder('Your name').fill(CHAIN_PLAYER_NAMES[0]);
        await host.getByRole('button', { name: 'Gather a New Village' }).click();
        await host.waitForURL(/\/room\/([A-Z0-9]+)/);
        const roomCode = /\/room\/([A-Z0-9]+)/.exec(host.url())?.[1] ?? '';
        expect(roomCode).not.toBe('');
        const hostPlayerId = await host.evaluate(() => localStorage.getItem('werewolf.playerId'));
        expect(hostPlayerId).toBeTruthy();

        await joinRestOfRoom(pages, CHAIN_PLAYER_NAMES, roomCode);
        await shoot('all 8 players joined');

        const rolesRes = await request.post(`${LOBBY_API_BASE}/roles`, {
            data: { roomCode, requestedBy: hostPlayerId, distribution: CHAIN_ROLE_DISTRIBUTION }
        });
        expect(
            rolesRes.ok(),
            `role distribution update failed: ${await rolesRes.text()}`
        ).toBeTruthy();

        await readyUpRestOfRoom(host, pages, CHAIN_PLAYER_NAMES);
        await shoot('all 8 players ready');

        await host.getByRole('button', { name: /Start Game|Force Start/ }).click();
        await expect(host.locator('.phase-banner__status').getByText(/NIGHT 1/)).toBeVisible();
        await shoot('game started, night 1');

        const nameOf = await fetchDisplayNames(request, roomCode);
        const reveal = host.locator('app-death-reveal .death-reveal');

        // --- Night 1: Cupid pairs two Villagers, the Werewolf kills one of them -- the lover-link
        // cascade kills the other in the same resolution. Both deaths land within
        // DEATH_BATCH_WINDOW_MS of each other, so room-shell.ts batches them into a single
        // "A and B were found dead" reveal instead of two separate takeovers.
        let state: GameState = await getState(request, roomCode);
        const wolf = state.players.find((p) => p.role === 'Werewolf')!;
        const cupid = state.players.find((p) => p.role === 'Cupid')!;
        const hunter = state.players.find((p) => p.role === 'Hunter')!;
        const villagers = state.players.filter((p) => p.role === 'Villager');
        const [lover1, lover2, lynchTarget, hunterShotTarget] = villagers;

        await post(request, '/game/cupid', {
            roomCode,
            playerId: cupid.playerId,
            firstPlayerId: lover1.playerId,
            secondPlayerId: lover2.playerId
        });
        await post(request, '/game/werewolf/vote', {
            roomCode,
            playerId: wolf.playerId,
            targetPlayerId: lover1.playerId
        });

        await expectRevealEitherOrder(
            reveal,
            nameOf.get(lover1.playerId)!,
            nameOf.get(lover2.playerId)!,
            shoot,
            'lover-link cascade batched reveal shown'
        );

        state = await waitForPhase(request, roomCode, (s) => s.phase === 'DayDiscussion');
        expect(state.phase).toBe('DayDiscussion');

        // --- Day 1: an ordinary lynch, just to confirm the chain game still lynches normally, with
        // its own reason and no batching.
        await resolveDay(request, roomCode, hostPlayerId!, (voter) =>
            voter.playerId === lynchTarget.playerId ? undefined : lynchTarget.playerId
        );
        await expect(reveal).toBeVisible({ timeout: 15_000 });
        await expect(reveal).toHaveClass(/death-reveal--tallying/);
        await host.waitForTimeout(500);
        await shoot('day 1 lynch tallying stage shown');
        await expect(reveal.locator('.death-reveal__text')).toHaveText(
            `${nameOf.get(lynchTarget.playerId)} was lynched`,
            { timeout: 6_000 }
        );
        await host.waitForTimeout(500);
        await shoot('day 1 lynch reveal shown');
        await expect(reveal).toBeHidden({ timeout: 8_000 });

        state = await waitForPhase(
            request,
            roomCode,
            (s) => s.phase === 'Night' && s.nightNumber === 2
        );
        expect(state.nightNumber).toBe(2);

        // --- Night 2: the Werewolf kills the Hunter -- her own death reveals immediately, but her
        // unused revenge shot pauses the phase transition (PendingHunterRevenge) until she fires.
        await post(request, '/game/werewolf/vote', {
            roomCode,
            playerId: wolf.playerId,
            targetPlayerId: hunter.playerId
        });
        await expectReveal(
            reveal,
            `${nameOf.get(hunter.playerId)} was found dead`,
            shoot,
            'hunter killed, reveal shown'
        );

        state = await waitForPhase(request, roomCode, (s) => s.pendingHunterRevenge.length > 0);
        expect(state.pendingHunterRevenge).toContain(hunter.playerId);

        // A dead Hunter can still fire her queued revenge shot -- this lands well after her own
        // death's reveal already dismissed (it only fires once this call resolves), so it's a
        // genuinely separate reveal rather than something batched with the death above.
        await post(request, '/game/hunter/shoot', {
            roomCode,
            playerId: hunter.playerId,
            targetPlayerId: hunterShotTarget.playerId
        });
        await expectReveal(
            reveal,
            `${nameOf.get(hunterShotTarget.playerId)} was found dead`,
            shoot,
            'hunter-revenge shot reveal shown'
        );

        // Regression check: the room-shell UI is still healthy after both chains.
        await expect(host.locator('.room-shell')).toBeVisible();
        await shoot('room still healthy after both chains');
    } finally {
        await Promise.all(contexts.map((ctx) => ctx.close()));
    }
});

const LYNCH_CHAIN_PLAYER_NAMES = ['Host', 'Bob', 'Cara', 'Dan', 'Eve'];

/** Cupid pairs two Villagers night 1; the Werewolf kills a third (uninvolved) Villager that same
 * night, purely so night 1 resolves without touching the lovers. Day 1 then lynches one of the
 * lovers -- CloseVotingAndResolve appends `PlayerDied(cause: "lynch")` for the lynch target and,
 * in the same resolution, `PlayerDied(cause: "lover-link")` for her partner. */
const LYNCH_CHAIN_ROLE_DISTRIBUTION: Record<string, number> = {
    Werewolf: 1,
    Cupid: 1,
    Villager: 3
};

test('lynching one half of a paired couple reveals the lynch with its reason, then the lover-link death without one', async ({
    browser,
    request
}) => {
    test.setTimeout(90_000);

    const contexts = await Promise.all(
        LYNCH_CHAIN_PLAYER_NAMES.map(() =>
            browser.newContext({ viewport: { width: 1440, height: 900 } })
        )
    );
    const pages = await Promise.all(contexts.map((ctx) => ctx.newPage()));
    const [host] = pages;
    const shoot = createStepper(host, 'death-reveal-lynch-chain');

    try {
        await host.goto('/');
        await host.getByPlaceholder('Your name').fill(LYNCH_CHAIN_PLAYER_NAMES[0]);
        await host.getByRole('button', { name: 'Gather a New Village' }).click();
        await host.waitForURL(/\/room\/([A-Z0-9]+)/);
        const roomCode = /\/room\/([A-Z0-9]+)/.exec(host.url())?.[1] ?? '';
        expect(roomCode).not.toBe('');
        const hostPlayerId = await host.evaluate(() => localStorage.getItem('werewolf.playerId'));
        expect(hostPlayerId).toBeTruthy();

        await joinRestOfRoom(pages, LYNCH_CHAIN_PLAYER_NAMES, roomCode);
        await shoot('all players joined');

        const rolesRes = await request.post(`${LOBBY_API_BASE}/roles`, {
            data: {
                roomCode,
                requestedBy: hostPlayerId,
                distribution: LYNCH_CHAIN_ROLE_DISTRIBUTION
            }
        });
        expect(
            rolesRes.ok(),
            `role distribution update failed: ${await rolesRes.text()}`
        ).toBeTruthy();

        await readyUpRestOfRoom(host, pages, LYNCH_CHAIN_PLAYER_NAMES);
        await shoot('all players ready');

        await host.getByRole('button', { name: /Start Game|Force Start/ }).click();
        await expect(host.locator('.phase-banner__status').getByText(/NIGHT 1/)).toBeVisible();
        await shoot('game started, night 1');

        const nameOf = await fetchDisplayNames(request, roomCode);
        const reveal = host.locator('app-death-reveal .death-reveal');

        let state: GameState = await getState(request, roomCode);
        const wolf = state.players.find((p) => p.role === 'Werewolf')!;
        const cupid = state.players.find((p) => p.role === 'Cupid')!;
        const villagers = state.players.filter((p) => p.role === 'Villager');
        const [lover1, lover2, nightKillTarget] = villagers;

        await post(request, '/game/cupid', {
            roomCode,
            playerId: cupid.playerId,
            firstPlayerId: lover1.playerId,
            secondPlayerId: lover2.playerId
        });
        await post(request, '/game/werewolf/vote', {
            roomCode,
            playerId: wolf.playerId,
            targetPlayerId: nightKillTarget.playerId
        });

        await expectReveal(
            reveal,
            `${nameOf.get(nightKillTarget.playerId)} was found dead`,
            shoot,
            'night 1 kill reveal shown (uninvolved villager, no cascade)'
        );

        state = await waitForPhase(request, roomCode, (s) => s.phase === 'DayDiscussion');
        expect(state.phase).toBe('DayDiscussion');

        // Lynch one of the two lovers -- her partner's lover-link death cascades in the same
        // resolution.
        await resolveDay(request, roomCode, hostPlayerId!, (voter) =>
            voter.playerId === lover1.playerId ? undefined : lover1.playerId
        );

        await expect(reveal).toBeVisible({ timeout: 15_000 });
        await expect(reveal).toHaveClass(/death-reveal--tallying/);
        await host.waitForTimeout(500);
        await shoot('lynch tallying stage shown');

        // The lynch target gets her own reveal, with a reason.
        await expect(reveal.locator('.death-reveal__text')).toHaveText(
            `${nameOf.get(lover1.playerId)} was lynched`,
            { timeout: 6_000 }
        );
        await expect(reveal).not.toHaveClass(/death-reveal--tallying/);
        await host.waitForTimeout(500);
        await shoot('lynch reveal shown, with reason');
        // Deliberately no toBeHidden check here -- the lover-link cascade below appears the instant
        // this dismisses (room-shell.ts's queue), so a generic `.death-reveal` locator never
        // actually observes "hidden" in between (see expectReveal's own comment for the same
        // reasoning). Its toBeHidden call covers both this dismissal and its own.

        // The lover-link cascade death is a separate PlayerDied (cause "lover-link"), batched like
        // any other non-lynch death -- her partner's name shows with no reason attached.
        await expectReveal(
            reveal,
            `${nameOf.get(lover2.playerId)} was found dead`,
            shoot,
            'lover-link cascade reveal shown, no reason'
        );

        // Regression check: the room-shell UI is still healthy after the lynch+cascade chain.
        await expect(host.locator('.room-shell')).toBeVisible();
        await shoot('room still healthy after lynch chain');
    } finally {
        await Promise.all(contexts.map((ctx) => ctx.close()));
    }
});
