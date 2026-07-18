import { test, expect, APIRequestContext } from '@playwright/test';
import { createStepper } from './utils/screenshot';
import {
    API_BASE,
    GamePlayer,
    getState,
    joinRestOfRoom,
    post,
    readyUpRestOfRoom,
    resolveDay,
    resolvePendingHunterRevenge,
    waitForPhase
} from './utils/game-api';

const PLAYER_NAMES = ['Host', 'Bob', 'Cara', 'Dan', 'Eve', 'Finn', 'Gia', 'Hana'];

// A lean distribution (only one Werewolf) deliberately makes the "wolves >= living non-wolves"
// win condition slow to reach -- with 7 non-wolves, that takes 6 kills, so the test can drive
// several nights deterministically without the game ending out from under it. Abstaining every
// day vote (see resolveDay's `() => undefined` below) rules out an early lynch-based ending
// altogether.
const ROLE_DISTRIBUTION: Record<string, number> = {
    Werewolf: 1,
    Doctor: 1,
    Seer: 1,
    Witch: 1,
    Hunter: 1,
    Cupid: 1,
    Villager: 2
};

test('an 8-player game runs past night 3, with chat and rules-setup exercised along the way', async ({
    browser,
    request
}) => {
    test.setTimeout(120_000);

    const contexts = await Promise.all(
        PLAYER_NAMES.map(() => browser.newContext({ viewport: { width: 1440, height: 900 } }))
    );
    const pages = await Promise.all(contexts.map((ctx) => ctx.newPage()));
    const [host, bob] = pages;
    const shoot = createStepper(host, 'full-game-happy-path');

    try {
        await host.goto('/');
        await host.getByPlaceholder('Your name').fill(PLAYER_NAMES[0]);
        await host.getByRole('button', { name: 'Gather a New Village' }).click();
        await host.waitForURL(/\/room\/([A-Z0-9]+)/);
        const roomCode = /\/room\/([A-Z0-9]+)/.exec(host.url())?.[1] ?? '';
        expect(roomCode).not.toBe('');
        const hostPlayerId = await host.evaluate(() => localStorage.getItem('werewolf.playerId'));
        expect(hostPlayerId).toBeTruthy();

        // Join everyone before configuring roles -- UpdateRoleDistribution validates the proposed
        // counts against how many players have *currently* joined ("werewolf count must be less
        // than half of players"), so applying it with only the host present rejects almost any
        // real distribution and silently leaves the lobby's default in place.
        await joinRestOfRoom(pages, PLAYER_NAMES, roomCode);
        await shoot('all 8 players joined');

        // "Other things": configure the role distribution through the real Rules & Setup UI
        // (not a direct API call) -- also a functional check that the number-spinner fix didn't
        // break these inputs.
        await host.getByRole('button', { name: /Rules & Setup/ }).click();
        for (const [role, count] of Object.entries(ROLE_DISTRIBUTION)) {
            const row = host.locator('.settings-modal__role-row').filter({ hasText: role });
            await row.locator('input[type="number"]').fill(String(count));
        }
        await host.getByRole('button', { name: 'Apply Role Distribution' }).click();
        await host.getByRole('button', { name: 'Confirm & Close' }).click();
        await shoot('role distribution configured');

        await readyUpRestOfRoom(host, pages, PLAYER_NAMES);
        await shoot('all 8 players ready');

        await host.getByRole('button', { name: /Start Game|Force Start/ }).click();
        await expect(host.getByText(/NIGHT 1/)).toBeVisible();
        await shoot('game started');

        // Drive nights/voting via direct API calls -- see resolveNight/resolveDay below. A full
        // 8-player game played out entirely through UI clicks for every role's night action
        // across 4+ nights would be extremely slow and fragile against per-role picker selectors;
        // the API calls exercise the exact same backend endpoints the UI's night-action panel
        // itself calls (GameApiService), so this still verifies the real game-flow contract.
        const lastDoctorTarget: { id: string | null } = { id: null };
        for (let round = 0; round < 4; round++) {
            await resolveNight(request, roomCode, lastDoctorTarget);
            let state = await waitForPhase(
                request,
                roomCode,
                (s) => s.phase !== 'Night' || s.phase === 'GameOver'
            );
            if (state.phase === 'GameOver') {
                break;
            }

            if (round === 0) {
                // "Chat and other things": exchange a real Town Square message during the first
                // Day Discussion, verified live over SignalR between two actual browser pages --
                // not just that the history endpoint returns what was sent.
                await expect(host.locator('.phase-banner__status')).toHaveText('DAY DISCUSSION');
                await host.locator('input[name="townMessage"]').fill('Who looks suspicious?');
                await host.locator('input[name="townMessage"]').press('Enter');
                await expect(bob.getByText('Who looks suspicious?')).toBeVisible({
                    timeout: 10_000
                });

                await bob.locator('input[name="townMessage"]').fill('Not me, I swear!');
                await bob.locator('input[name="townMessage"]').press('Enter');
                await expect(host.getByText('Not me, I swear!')).toBeVisible({ timeout: 10_000 });
                await shoot('town square chat exchanged');
            }

            // Every living player abstains -- guarantees no lynch (and so no Tanner-win/
            // premature-parity edge cases), while still exercising the full vote/advance/close
            // call sequence.
            await resolveDay(request, roomCode, hostPlayerId!, () => undefined);
            state = await waitForPhase(request, roomCode, (s) => s.phase !== 'DayVoting');
            if (state.phase === 'GameOver') {
                break;
            }
        }

        const finalState = await getState(request, roomCode);
        expect(finalState.nightNumber).toBeGreaterThan(3);

        // "Other things": the game log should already reflect several nights/days of play.
        const logRes = await request.get(`${API_BASE}/game/${roomCode}/log`);
        expect(logRes.ok()).toBeTruthy();
        const log = await logRes.json();
        expect(log.entries.length).toBeGreaterThan(0);

        // Confirm the live room-shell UI is still healthy this deep into the game (regression
        // check for the layout redesign, exercised under real multi-night state rather than a
        // freshly-started game).
        await host.waitForTimeout(500);
        await expect(host.locator('.room-shell')).toBeVisible();
        await shoot(`night ${finalState.nightNumber} reached`);
    } finally {
        await Promise.all(contexts.map((ctx) => ctx.close()));
    }
});

/** Drives every living role holder's action for one Night phase, in the fixed server-enforced
 * turn order (Cupid -> Werewolves -> Doctor -> Seer -> Witch). Werewolves always target the same
 * arbitrary living non-wolf (list[0], re-derived fresh each call since deaths shift the array), so
 * exactly one kill lands per night baseline -- the Doctor deliberately protects someone else, so
 * this test's kill count stays predictable rather than depending on chance protection.
 * `lastDoctorTarget` (mutated in place, `{ id }` boxed so the caller sees updates across calls) is
 * needed because the Doctor can't protect the same player two nights running -- picking the same
 * "first eligible" candidate every night via a stateless rule would violate that guard. */
async function resolveNight(
    request: APIRequestContext,
    roomCode: string,
    lastDoctorTarget: { id: string | null }
): Promise<void> {
    let state = await getState(request, roomCode);
    const alive = () => state.players.filter((p) => p.isAlive);
    const byRole = (role: string) => alive().find((p) => p.role === role);

    if (state.nightNumber === 1) {
        const cupid = byRole('Cupid');
        if (cupid) {
            // Excludes the Werewolf deliberately: if Cupid happened to pair the lone Werewolf with
            // whoever this test's kill logic later targets, that death's lover-link cascade would
            // kill the Werewolf too -- zero wolves left, an immediate Villagers win that cuts the
            // game short instead of running past night 3 as intended. (The custom-rules-scenarios
            // suite exercises that exact cascade deliberately, with its own controlled targeting.)
            const others = alive().filter(
                (p) => p.playerId !== cupid.playerId && p.role !== 'Werewolf'
            );
            await post(request, '/game/cupid', {
                roomCode,
                playerId: cupid.playerId,
                firstPlayerId: others[0].playerId,
                secondPlayerId: others[1].playerId
            });
        }
    }

    const wolves = alive().filter((p) => p.role === 'Werewolf');
    const nonWolves = alive().filter((p) => p.role !== 'Werewolf');
    const killTarget = nonWolves[0];
    for (const wolf of wolves) {
        await post(request, '/game/werewolf/vote', {
            roomCode,
            playerId: wolf.playerId,
            targetPlayerId: killTarget.playerId
        });
    }

    const doctor = byRole('Doctor');
    if (doctor) {
        const protectTarget = alive().find(
            (p: GamePlayer) =>
                p.playerId !== doctor.playerId &&
                p.playerId !== killTarget.playerId &&
                p.playerId !== lastDoctorTarget.id
        );
        if (protectTarget) {
            await post(request, '/game/doctor/protect', {
                roomCode,
                playerId: doctor.playerId,
                targetPlayerId: protectTarget.playerId
            });
            lastDoctorTarget.id = protectTarget.playerId;
        }
    }

    const seer = byRole('Seer');
    if (seer) {
        const inspectTarget = alive().find((p) => p.playerId !== seer.playerId);
        if (inspectTarget) {
            await post(request, '/game/seer/inspect', {
                roomCode,
                playerId: seer.playerId,
                targetPlayerId: inspectTarget.playerId
            });
        }
    }

    const witch = byRole('Witch');
    if (witch) {
        await post(request, '/game/witch/pass', { roomCode, playerId: witch.playerId });
    }

    state = await getState(request, roomCode);
    await resolvePendingHunterRevenge(request, roomCode, state);
}
