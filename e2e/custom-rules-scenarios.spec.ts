import { test, expect, Page } from '@playwright/test';
import { createStepper } from './utils/screenshot';
import {
    GamePlayer,
    GameState,
    getState,
    joinRestOfRoom,
    post,
    readyUpRestOfRoom,
    resolveDay,
    waitForPhase
} from './utils/game-api';

// Same distribution across all three scenarios below (12 players): 3 Werewolves, 1 each of
// Seer/Doctor/Cupid/Tanner, 5 Villagers.
const PLAYER_NAMES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12'];
// Every role gets an explicit value (including the two this suite doesn't use) -- the settings
// modal's inputs start pre-filled with whatever the lobby's default distribution is, and leaving
// Hunter/Witch untouched would carry over their nonzero defaults, pushing the total above 12 and
// silently failing UpdateRoleDistribution (leaving the default distribution in effect instead --
// which is what happened before this fix: no Cupid in the assigned roles at all).
const ROLE_DISTRIBUTION: Record<string, number> = {
    Werewolf: 3,
    Seer: 1,
    Doctor: 1,
    Hunter: 0,
    Witch: 0,
    Cupid: 1,
    Tanner: 1,
    Villager: 5
};

interface Setup {
    host: Page;
    pages: Page[];
    roomCode: string;
    hostPlayerId: string;
    shoot: (label: string) => Promise<void>;
    contexts: Awaited<ReturnType<Page['context']>>[];
}

/** Note: exact P1..P12 role assignments from a hand-written scenario can't be reproduced literally
 * -- StartGame assigns roles server-side, not by seat order -- so every scenario below drives its
 * script by role (`byRole('Werewolf')[0]`, etc.) rather than by player name. The mechanics and
 * outcome sequence are faithful to the scripted scenario; the specific P-number holding each role
 * varies run to run. */
async function setUpTwelvePlayerGame(
    browser: import('@playwright/test').Browser,
    testName: string
): Promise<Setup> {
    const contexts = await Promise.all(
        PLAYER_NAMES.map(() => browser.newContext({ viewport: { width: 1440, height: 900 } }))
    );
    const pages = await Promise.all(contexts.map((ctx) => ctx.newPage()));
    const host = pages[0];
    const shoot = createStepper(host, testName);

    await host.goto('/');
    await host.getByPlaceholder('Your name').fill(PLAYER_NAMES[0]);
    await host.getByRole('button', { name: 'Gather a New Village' }).click();
    await host.waitForURL(/\/room\/([A-Z0-9]+)/);
    const roomCode = /\/room\/([A-Z0-9]+)/.exec(host.url())?.[1] ?? '';
    expect(roomCode).not.toBe('');
    const hostPlayerId = await host.evaluate(() => localStorage.getItem('werewolf.playerId'));
    expect(hostPlayerId).toBeTruthy();
    await shoot('host created room');

    // Join everyone before configuring roles -- UpdateRoleDistribution validates the proposed
    // counts against how many players have *currently* joined ("werewolf count must be less than
    // half of players"), so applying it with only the host present rejects almost any real
    // distribution and silently leaves the lobby's default in place.
    await joinRestOfRoom(pages, PLAYER_NAMES, roomCode);
    await shoot('all 12 players joined');

    await host.getByRole('button', { name: /Rules & Setup/ }).click();
    for (const [role, count] of Object.entries(ROLE_DISTRIBUTION)) {
        const row = host.locator('.settings-modal__role-row').filter({ hasText: role });
        await row.locator('input[type="number"]').fill(String(count));
    }
    await host.getByRole('button', { name: 'Apply Role Distribution' }).click();
    await host.getByRole('button', { name: 'Confirm & Close' }).click();
    await shoot('role distribution set (3 wolves, seer, doctor, cupid, tanner, 5 villagers)');

    await readyUpRestOfRoom(host, pages, PLAYER_NAMES);
    await shoot('all 12 players ready');

    await host.getByRole('button', { name: /Start Game|Force Start/ }).click();
    await expect(host.getByText(/NIGHT 1/)).toBeVisible();
    await shoot('game started');

    return { host, pages, roomCode, hostPlayerId: hostPlayerId!, shoot, contexts };
}

function alive(state: GameState): GamePlayer[] {
    return state.players.filter((p) => p.isAlive);
}

function byRole(state: GameState, role: string): GamePlayer[] {
    return alive(state).filter((p) => p.role === role);
}

test.describe('custom-rules scenarios (12 players, checked against GAME_FLOW.md rules)', () => {
    test('Test Case 1 -- Village Victory (doctor saves, seer reads, lover chain death)', async ({
        browser,
        request
    }) => {
        test.setTimeout(120_000);
        const { host, roomCode, hostPlayerId, shoot, contexts } = await setUpTwelvePlayerGame(
            browser,
            'village-victory'
        );

        try {
            // Night 1 -- Cupid links a Werewolf and a Villager (the "wolf + villager lovers" case
            // called out in the brief): the Villager's death later must cascade to this Werewolf.
            let state = await getState(request, roomCode);
            const cupid = byRole(state, 'Cupid')[0];
            const loverWolf = byRole(state, 'Werewolf')[0];
            const loverVillager = byRole(state, 'Villager')[0];
            await post(request, '/game/cupid', {
                roomCode,
                playerId: cupid.playerId,
                firstPlayerId: loverWolf.playerId,
                secondPlayerId: loverVillager.playerId
            });
            await host.waitForTimeout(200);
            await shoot('night 1: cupid links a werewolf and a villager');

            // Wolves attack a villager who isn't the lover; Doctor protects the same villager --
            // a successful protection, no death.
            state = await getState(request, roomCode);
            const wolves1 = byRole(state, 'Werewolf');
            const doctor = byRole(state, 'Doctor')[0];
            const villagerTarget1 = alive(state).find(
                (p) => p.role === 'Villager' && p.playerId !== loverVillager.playerId
            )!;
            for (const wolf of wolves1) {
                await post(request, '/game/werewolf/vote', {
                    roomCode,
                    playerId: wolf.playerId,
                    targetPlayerId: villagerTarget1.playerId
                });
            }
            await host.waitForTimeout(200);
            await shoot('night 1: werewolves vote to attack a villager');

            await post(request, '/game/doctor/protect', {
                roomCode,
                playerId: doctor.playerId,
                targetPlayerId: villagerTarget1.playerId
            });
            await host.waitForTimeout(200);
            await shoot('night 1: doctor protects the werewolves’ target');

            // Seer inspects a non-lover werewolf and (mechanically) learns "Werewolf" -- the day
            // vote below lynches this exact player, matching "village lynches who the Seer flags."
            const seer = byRole(state, 'Seer')[0];
            const nonLoverWolves = wolves1.filter((w) => w.playerId !== loverWolf.playerId);
            const seerTarget1 = nonLoverWolves[0];
            await post(request, '/game/seer/inspect', {
                roomCode,
                playerId: seer.playerId,
                targetPlayerId: seerTarget1.playerId
            });
            await host.waitForTimeout(200);
            await shoot('night 1: seer inspects a werewolf');

            state = await waitForPhase(request, roomCode, (s) => s.phase !== 'Night');
            expect(state.phase).toBe('DayDiscussion');
            const villagerTarget1AfterNight = state.players.find(
                (p) => p.playerId === villagerTarget1.playerId
            );
            expect(villagerTarget1AfterNight?.isAlive, 'doctor should have saved the target').toBe(
                true
            );
            await shoot('day 1: no deaths -- doctor’s protection succeeded');

            // Day 1 -- lynch the werewolf the Seer identified (mechanic: "Multiple wolf
            // executions"). Leave the lover-wolf alive for now.
            state = await resolveDay(request, roomCode, hostPlayerId, () => seerTarget1.playerId);
            await host.waitForTimeout(200);
            await shoot('day 1: village executes the werewolf the seer identified');
            expect(state.players.find((p) => p.playerId === seerTarget1.playerId)?.isAlive).toBe(
                false
            );

            state = await waitForPhase(request, roomCode, (s) => s.phase !== 'DayVoting');
            expect(state.nightNumber).toBe(2);

            // Night 2 -- wolves kill the Doctor outright (Doctor protects someone else, not self).
            const wolves2 = byRole(state, 'Werewolf');
            const doctor2 = byRole(state, 'Doctor')[0];
            for (const wolf of wolves2) {
                await post(request, '/game/werewolf/vote', {
                    roomCode,
                    playerId: wolf.playerId,
                    targetPlayerId: doctor2.playerId
                });
            }
            await host.waitForTimeout(200);
            await shoot('night 2: werewolves target the doctor');

            const protectTarget2 = alive(state).find(
                (p) => p.role === 'Villager' && p.playerId !== villagerTarget1.playerId
            )!;
            await post(request, '/game/doctor/protect', {
                roomCode,
                playerId: doctor2.playerId,
                targetPlayerId: protectTarget2.playerId
            });
            await host.waitForTimeout(200);
            await shoot('night 2: doctor protects someone other than themself');

            const seer2 = byRole(state, 'Seer')[0];
            const nonLoverWolves2 = alive(state).filter(
                (p) => p.role === 'Werewolf' && p.playerId !== loverWolf.playerId
            );
            const seerTarget2 = nonLoverWolves2[0];
            await post(request, '/game/seer/inspect', {
                roomCode,
                playerId: seer2.playerId,
                targetPlayerId: seerTarget2.playerId
            });
            await host.waitForTimeout(200);
            await shoot('night 2: seer inspects the other non-lover werewolf');

            state = await waitForPhase(request, roomCode, (s) => s.phase !== 'Night');
            expect(state.players.find((p) => p.playerId === doctor2.playerId)?.isAlive).toBe(false);
            await shoot('day 2: the doctor has died');

            // Day 2 -- lynch the second werewolf the Seer identified.
            state = await resolveDay(request, roomCode, hostPlayerId, () => seerTarget2.playerId);
            await host.waitForTimeout(200);
            await shoot('day 2: village executes the second werewolf');
            expect(state.players.find((p) => p.playerId === seerTarget2.playerId)?.isAlive).toBe(
                false
            );
            expect(byRole(state, 'Werewolf')).toHaveLength(1);
            expect(byRole(state, 'Werewolf')[0].playerId).toBe(loverWolf.playerId);

            state = await waitForPhase(request, roomCode, (s) => s.phase !== 'DayVoting');
            expect(state.nightNumber).toBe(3);

            // Night 3 -- only the lover-wolf remains; they kill the Seer (Doctor's already dead,
            // nobody can protect). The Seer still gets to act this same night before the death
            // cascade applies (a role's own death is only resolved once every living role's slot
            // is marked done, including its own) -- inspect the lone wolf on the way out.
            const seer3 = byRole(state, 'Seer')[0];
            await post(request, '/game/werewolf/vote', {
                roomCode,
                playerId: loverWolf.playerId,
                targetPlayerId: seer3.playerId
            });
            await post(request, '/game/seer/inspect', {
                roomCode,
                playerId: seer3.playerId,
                targetPlayerId: loverWolf.playerId
            });
            await host.waitForTimeout(200);
            await shoot('night 3: the last werewolf kills the seer (undefended)');

            state = await waitForPhase(request, roomCode, (s) => s.phase !== 'Night');
            expect(state.players.find((p) => p.playerId === seer3.playerId)?.isAlive).toBe(false);
            await shoot('day 3: the seer has died');

            // Day 3 -- lynch the last werewolf. This should cascade: their paired lover-Villager
            // dies too ("lover-link"), and with zero werewolves left, Villagers win immediately.
            state = await resolveDay(request, roomCode, hostPlayerId, () => loverWolf.playerId);
            await host.waitForTimeout(300);
            await shoot('day 3: village executes the last werewolf -- game over');

            expect(state.players.find((p) => p.playerId === loverWolf.playerId)?.isAlive).toBe(
                false
            );
            expect(
                state.players.find((p) => p.playerId === loverVillager.playerId)?.isAlive,
                'the lynched wolf’s paired lover should die too (lover-link chain death)'
            ).toBe(false);
            expect(state.phase).toBe('GameOver');
            expect(state.result?.winningFaction).toBe('Villagers');
        } finally {
            await Promise.all(contexts.map((ctx) => ctx.close()));
        }
    });

    test('Test Case 2 -- Werewolf Victory (failed protection, wrong executions, wolf parity)', async ({
        browser,
        request
    }) => {
        test.setTimeout(120_000);
        const { host, roomCode, hostPlayerId, shoot, contexts } = await setUpTwelvePlayerGame(
            browser,
            'werewolf-victory'
        );

        try {
            // Night 1 -- Cupid links two Villagers this time (no wolf involved). Wolves kill the
            // Seer; Doctor "protects the wrong target" (anyone but the Seer) so the kill lands.
            let state = await getState(request, roomCode);
            const cupid = byRole(state, 'Cupid')[0];
            const villagers = byRole(state, 'Villager');
            await post(request, '/game/cupid', {
                roomCode,
                playerId: cupid.playerId,
                firstPlayerId: villagers[0].playerId,
                secondPlayerId: villagers[1].playerId
            });
            await host.waitForTimeout(200);
            await shoot('night 1: cupid links two villagers');

            const seer = byRole(state, 'Seer')[0];
            const doctor = byRole(state, 'Doctor')[0];
            const tanner = byRole(state, 'Tanner')[0];
            for (const wolf of byRole(state, 'Werewolf')) {
                await post(request, '/game/werewolf/vote', {
                    roomCode,
                    playerId: wolf.playerId,
                    targetPlayerId: seer.playerId
                });
            }
            await host.waitForTimeout(200);
            await shoot('night 1: werewolves target the seer');

            const wrongProtectTarget = villagers.find((v) => v.playerId !== villagers[0].playerId)!;
            await post(request, '/game/doctor/protect', {
                roomCode,
                playerId: doctor.playerId,
                targetPlayerId: wrongProtectTarget.playerId
            });
            await host.waitForTimeout(200);
            await shoot('night 1: doctor protects the wrong target -- seer is exposed');

            // The Seer still gets to act this same night before the death cascade applies (a
            // role's own death only resolves once every living role's slot -- including its own --
            // is marked done), so they must inspect someone on the way out or the night never
            // completes.
            await post(request, '/game/seer/inspect', {
                roomCode,
                playerId: seer.playerId,
                targetPlayerId: byRole(state, 'Werewolf')[0].playerId
            });
            await host.waitForTimeout(200);
            await shoot('night 1: seer inspects a werewolf on the way out');

            state = await waitForPhase(request, roomCode, (s) => s.phase !== 'Night');
            expect(
                state.players.find((p) => p.playerId === seer.playerId)?.isAlive,
                'failed doctor protection: the seer should have died'
            ).toBe(false);
            await shoot('day 1: the unprotected seer has died');

            // Every day from here on, the village lynches an arbitrary living Villager ("wrong
            // executions") -- deliberately never the Tanner, since lynching the Tanner ends the
            // game immediately for them (see Test Case 3), which would pre-empt this scenario's
            // intended Werewolf-parity ending.
            const lynchAWrongVillager = (s: GameState) =>
                byRole(s, 'Villager')[0]?.playerId ?? byRole(s, 'Cupid')[0]?.playerId;

            state = await resolveDay(request, roomCode, hostPlayerId, (_voter, s) =>
                lynchAWrongVillager(s)
            );
            await host.waitForTimeout(200);
            await shoot('day 1: village mistakenly executes a villager');
            state = await waitForPhase(request, roomCode, (s) => s.phase !== 'DayVoting');

            // Night 2 -- wolves kill the Doctor (self-protection would have saved them; instead
            // they protect someone else again).
            const doctor2 = byRole(state, 'Doctor')[0];
            for (const wolf of byRole(state, 'Werewolf')) {
                await post(request, '/game/werewolf/vote', {
                    roomCode,
                    playerId: wolf.playerId,
                    targetPlayerId: doctor2.playerId
                });
            }
            const anotherVillager = byRole(state, 'Villager').find(
                (v) => v.playerId !== doctor2.playerId
            );
            if (anotherVillager) {
                await post(request, '/game/doctor/protect', {
                    roomCode,
                    playerId: doctor2.playerId,
                    targetPlayerId: anotherVillager.playerId
                });
            }
            await host.waitForTimeout(200);
            await shoot('night 2: werewolves kill the doctor');

            state = await waitForPhase(request, roomCode, (s) => s.phase !== 'Night');
            expect(state.players.find((p) => p.playerId === doctor2.playerId)?.isAlive).toBe(false);

            // Day 2 onward -- keep lynching non-Tanner villagers each day, and let the werewolves
            // keep killing each night, until wolf parity ends the game. Bounded to a handful of
            // rounds; the distribution (3 wolves, 9 non-wolves, 2 already dead) needs only a few
            // more deaths to reach "wolves >= living non-wolves."
            for (let round = 0; round < 6 && state.phase !== 'GameOver'; round++) {
                state = await resolveDay(request, roomCode, hostPlayerId, (_voter, s) =>
                    lynchAWrongVillager(s)
                );
                await host.waitForTimeout(150);
                await shoot(`day ${round + 2}: village executes another villager`);
                if (state.phase === 'GameOver') {
                    break;
                }
                state = await waitForPhase(request, roomCode, (s) => s.phase !== 'DayVoting');
                if (state.phase === 'GameOver') {
                    break;
                }

                const wolves = byRole(state, 'Werewolf');
                const nightVictim =
                    byRole(state, 'Villager')[0] ??
                    byRole(state, 'Cupid')[0] ??
                    byRole(state, 'Tanner')[0];
                if (wolves.length === 0 || !nightVictim) {
                    break;
                }
                for (const wolf of wolves) {
                    await post(request, '/game/werewolf/vote', {
                        roomCode,
                        playerId: wolf.playerId,
                        targetPlayerId: nightVictim.playerId
                    });
                }
                await host.waitForTimeout(150);
                await shoot(`night ${round + 3}: werewolves kill another villager`);
                state = await waitForPhase(request, roomCode, (s) => s.phase !== 'Night');
            }

            await shoot('game over: werewolves reach parity with the living villagers');
            expect(state.phase).toBe('GameOver');
            expect(state.result?.winningFaction).toBe('Werewolves');
            // The Tanner should still be among the final roles -- proof this scenario really won
            // via wolf parity, not a Tanner lynch.
            expect(state.result?.finalRoles[tanner.playerId]).toBe('Tanner');
        } finally {
            await Promise.all(contexts.map((ctx) => ctx.close()));
        }
    });

    test('Test Case 3 -- Tanner Victory (immediate end, no further processing)', async ({
        browser,
        request
    }) => {
        test.setTimeout(60_000);
        const { host, roomCode, hostPlayerId, shoot, contexts } = await setUpTwelvePlayerGame(
            browser,
            'tanner-victory'
        );

        try {
            // Night 1 -- ordinary actions: Cupid links a werewolf and a villager, wolves attack a
            // villager, Doctor successfully protects them, Seer inspects a werewolf. None of this
            // should matter once the Tanner is lynched -- included to prove the immediate end
            // really does pre-empt whatever else was in flight, not just skip an empty night.
            let state = await getState(request, roomCode);
            const cupid = byRole(state, 'Cupid')[0];
            const wolf0 = byRole(state, 'Werewolf')[0];
            const villager0 = byRole(state, 'Villager')[0];
            await post(request, '/game/cupid', {
                roomCode,
                playerId: cupid.playerId,
                firstPlayerId: wolf0.playerId,
                secondPlayerId: villager0.playerId
            });
            await host.waitForTimeout(200);
            await shoot('night 1: cupid links a werewolf and a villager');

            const doctor = byRole(state, 'Doctor')[0];
            const villagerTarget = byRole(state, 'Villager').find(
                (v) => v.playerId !== villager0.playerId
            )!;
            for (const wolf of byRole(state, 'Werewolf')) {
                await post(request, '/game/werewolf/vote', {
                    roomCode,
                    playerId: wolf.playerId,
                    targetPlayerId: villagerTarget.playerId
                });
            }
            await post(request, '/game/doctor/protect', {
                roomCode,
                playerId: doctor.playerId,
                targetPlayerId: villagerTarget.playerId
            });
            const seer = byRole(state, 'Seer')[0];
            const seerTarget = byRole(state, 'Werewolf')[0];
            await post(request, '/game/seer/inspect', {
                roomCode,
                playerId: seer.playerId,
                targetPlayerId: seerTarget.playerId
            });
            await host.waitForTimeout(200);
            await shoot('night 1: werewolves attack, doctor protects, seer inspects');

            state = await waitForPhase(request, roomCode, (s) => s.phase !== 'Night');
            expect(state.phase).toBe('DayDiscussion');
            expect(state.nightNumber).toBe(1);

            // Day 1 -- the village, ignoring the Seer's tip, lynches the Tanner outright.
            const tanner = byRole(state, 'Tanner')[0];
            state = await resolveDay(request, roomCode, hostPlayerId, () => tanner.playerId);
            await host.waitForTimeout(300);
            await shoot('day 1: village executes the tanner -- game ends immediately');

            expect(state.phase).toBe('GameOver');
            expect(state.result?.winningFaction).toBe('Tanner');
            expect(state.players.find((p) => p.playerId === tanner.playerId)?.isAlive).toBe(false);
            // "Immediate end": still night 1 / day 1 -- no NightStarted(2) or further resolution
            // ever fired, and nobody else died as a side effect of ending the game this way.
            expect(state.nightNumber).toBe(1);
            expect(state.dayNumber).toBe(1);
            const aliveOthers = state.players.filter(
                (p) => p.playerId !== tanner.playerId && p.isAlive
            );
            expect(aliveOthers.length).toBe(state.players.length - 1);

            // Re-fetching a moment later must show the identical GameOver state -- confirms the
            // ending really is terminal, not a transient phase the server keeps advancing past.
            await new Promise((resolve) => setTimeout(resolve, 500));
            const settledState = await getState(request, roomCode);
            expect(settledState.phase).toBe('GameOver');
            expect(settledState.nightNumber).toBe(1);
            await shoot('confirmed: state stays settled at GameOver, no further processing');
        } finally {
            await Promise.all(contexts.map((ctx) => ctx.close()));
        }
    });
});
