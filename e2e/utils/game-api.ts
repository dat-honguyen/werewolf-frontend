import { APIRequestContext, expect, Page } from '@playwright/test';

export const API_BASE = 'http://localhost:5080/api/v1';

export interface GamePlayer {
    playerId: string;
    role: string;
    isAlive: boolean;
}

export interface GameState {
    phase: string;
    nightNumber: number;
    dayNumber: number;
    players: GamePlayer[];
    lovers: { firstPlayerId: string; secondPlayerId: string } | null;
    pendingHunterRevenge: string[];
    result: { winningFaction: string; finalRoles: Record<string, string> } | null;
}

export async function getState(request: APIRequestContext, roomCode: string): Promise<GameState> {
    const res = await request.get(`${API_BASE}/game/${roomCode}`);
    expect(res.ok()).toBeTruthy();
    return res.json();
}

export async function post(request: APIRequestContext, path: string, data: object): Promise<void> {
    const res = await request.post(`${API_BASE}${path}`, { data });
    expect(res.ok(), `POST ${path} failed: ${await res.text()}`).toBeTruthy();
}

export async function resolvePendingHunterRevenge(
    request: APIRequestContext,
    roomCode: string,
    state: GameState
): Promise<boolean> {
    if (state.pendingHunterRevenge.length === 0) {
        return false;
    }
    await post(request, '/game/hunter/pass', { roomCode, playerId: state.pendingHunterRevenge[0] });
    return true;
}

export async function waitForPhase(
    request: APIRequestContext,
    roomCode: string,
    predicate: (state: GameState) => boolean,
    timeoutMs = 15_000
): Promise<GameState> {
    const deadline = Date.now() + timeoutMs;
    let state = await getState(request, roomCode);
    while (!predicate(state) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        state = await getState(request, roomCode);
        await resolvePendingHunterRevenge(request, roomCode, state);
    }
    return state;
}

/** Casts a vote for every currently-alive player, then closes voting. `chooseTarget` returning
 * `undefined` for a given voter casts an abstain for them. Voting can auto-close before the
 * explicit `/voting/close` call lands (an async projection side effect -- see GAME_FLOW.md §0.1),
 * so that call is best-effort (a 400 for an already-closed vote is expected, not a bug) rather
 * than asserted. */
export async function resolveDay(
    request: APIRequestContext,
    roomCode: string,
    hostPlayerId: string,
    chooseTarget: (voter: GamePlayer, state: GameState) => string | undefined
): Promise<GameState> {
    await post(request, '/game/voting/advance', { roomCode, requestedBy: hostPlayerId });

    let state = await getState(request, roomCode);
    for (const voter of state.players.filter((p) => p.isAlive)) {
        const targetPlayerId = chooseTarget(voter, state);
        await post(request, '/game/vote', {
            roomCode,
            voterPlayerId: voter.playerId,
            ...(targetPlayerId ? { targetPlayerId } : {})
        });
    }

    await request.post(`${API_BASE}/game/voting/close`, {
        data: { roomCode, requestedBy: hostPlayerId }
    });
    state = await getState(request, roomCode);
    await resolvePendingHunterRevenge(request, roomCode, state);
    return state;
}

/** Joins `count - 1` more players to a room a host page has already created. Must run before
 * configuring a custom role distribution -- UpdateRoleDistribution validates the proposed counts
 * against how many players have *currently* joined (e.g. "werewolf count must be less than half
 * of players"), so applying it while only the host has joined rejects almost any real
 * distribution and silently leaves the lobby's original default in place. */
export async function joinRestOfRoom(
    pages: Page[],
    playerNames: string[],
    roomCode: string
): Promise<void> {
    for (let i = 1; i < pages.length; i++) {
        const page = pages[i];
        await page.goto('/');
        await page.getByPlaceholder('Your name').fill(playerNames[i]);
        await page.getByRole('button', { name: 'Join Room' }).click();
        const codeInputs = page.locator('.home-code-char');
        for (let c = 0; c < roomCode.length; c++) {
            await codeInputs.nth(c).fill(roomCode[c]);
        }
        await page.getByRole('button', { name: 'Enter Village' }).click();
        await page.waitForURL(/\/room\/[A-Z0-9]+/);
    }
}

/** Waits for each player's Ready Up click to land in the HOST's own view before moving to the
 * next player.
 *
 * `Start Game`'s disabled state (room-shell.ts's canStartGame()) is gated on the HOST's own
 * locally-cached view of every player's isReady flag, which only updates via a lobby.updated
 * SignalR push -> GET /api/v1/lobby refetch (see game-state.service.ts). That push can race a
 * given page's hub subscription during a fast join burst -- so without this wait, the host's
 * Start Game can stay disabled forever and a later click on it is silently a no-op. */
export async function readyUpRestOfRoom(
    host: Page,
    pages: Page[],
    playerNames: string[]
): Promise<void> {
    for (let i = 1; i < pages.length; i++) {
        await pages[i].getByRole('button', { name: 'Ready Up' }).click();
        const playerRow = host
            .locator('.player-grid__card')
            .filter({ has: host.locator('.player-grid__name', { hasText: playerNames[i] }) });
        await expect(playerRow.locator('.player-grid__meta')).toContainText('• Ready', {
            timeout: 10_000
        });
    }
}

/** Convenience wrapper for tests that don't need to configure a custom role distribution between
 * joining and readying up. */
export async function joinAndReadyUpRestOfRoom(
    host: Page,
    pages: Page[],
    playerNames: string[],
    roomCode: string
): Promise<void> {
    await joinRestOfRoom(pages, playerNames, roomCode);
    await readyUpRestOfRoom(host, pages, playerNames);
}
