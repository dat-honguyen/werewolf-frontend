import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { GameStateResponse } from '../models/game.model';
import { GameStateService } from './game-state.service';

const gameStateUrl = (roomCode: string) => `${environment.apiBaseUrl}/api/v1/game/${roomCode}`;

function makeState(overrides: Partial<GameStateResponse>): GameStateResponse {
    return {
        roomCode: 'PQXR7K',
        phase: 'Night',
        nightNumber: 1,
        dayNumber: 0,
        players: [],
        lovers: null,
        werewolfLockedTarget: null,
        pendingHunterRevenge: [],
        result: null,
        currentNightRole: null,
        nightPrompt: null,
        discussionDeadlineUtc: null,
        votingDeadlineUtc: null,
        version: 0,
        ...overrides
    };
}

describe('GameStateService', () => {
    beforeEach(() => {
        localStorage.clear();
        TestBed.configureTestingModule({
            providers: [
                provideHttpClient(),
                provideHttpClientTesting(),
                provideRouter([]),
                { provide: TranslateService, useValue: { instant: (key: string) => key } }
            ]
        });
    });

    it('shows lobby when there is no game state yet', () => {
        const service = TestBed.inject(GameStateService);
        expect(service.currentView()).toBe('lobby');
    });

    it('shows role-reveal for RoleAssignment/Night until the player has seen it', () => {
        const service = TestBed.inject(GameStateService);
        service.gameState.set(makeState({ phase: 'Night' }));
        expect(service.currentView()).toBe('role-reveal');

        service.hasSeenRoleReveal.set(true);
        expect(service.currentView()).toBe('night');
    });

    it('maps the remaining phases to their screens', () => {
        const service = TestBed.inject(GameStateService);
        service.hasSeenRoleReveal.set(true);

        service.gameState.set(makeState({ phase: 'DayDiscussion' }));
        expect(service.currentView()).toBe('day-discussion');

        service.gameState.set(makeState({ phase: 'DayVoting' }));
        expect(service.currentView()).toBe('voting');

        service.gameState.set(makeState({ phase: 'GameOver' }));
        expect(service.currentView()).toBe('game-over');
    });

    it('overrides the phase-based view whenever hunter-revenge is pending', () => {
        const service = TestBed.inject(GameStateService);
        service.hasSeenRoleReveal.set(true);
        service.gameState.set(
            makeState({ phase: 'DayDiscussion', pendingHunterRevenge: ['player-1'] })
        );

        expect(service.currentView()).toBe('hunter-revenge');
    });

    it('resetForRematch clears game state and role-reveal so the next round starts fresh', () => {
        const service = TestBed.inject(GameStateService);
        service.hasSeenRoleReveal.set(true);
        service.gameState.set(makeState({ phase: 'GameOver' }));
        expect(service.currentView()).toBe('game-over');

        service.resetForRematch();

        expect(service.gameState()).toBeNull();
        expect(service.hasSeenRoleReveal()).toBe(false);
        expect(service.currentView()).toBe('lobby');
    });

    it('retries refreshGameState with backoff after a non-404 failure instead of giving up', async () => {
        vi.useFakeTimers();
        try {
            const service = TestBed.inject(GameStateService);
            const http = TestBed.inject(HttpTestingController);

            const promise = service.refreshGameState('PQXR7K');
            const firstRequest = await vi.waitFor(() => http.expectOne(gameStateUrl('PQXR7K')));
            firstRequest.flush('boom', { status: 500, statusText: 'Server Error' });
            await vi.advanceTimersByTimeAsync(1);
            expect(service.gameState()).toBeNull();

            await vi.advanceTimersByTimeAsync(500);
            const secondRequest = await vi.waitFor(() => http.expectOne(gameStateUrl('PQXR7K')));
            secondRequest.flush(makeState({ version: 3 }));
            await promise;

            expect(service.gameState()?.version).toBe(3);
        } finally {
            vi.useRealTimers();
        }
    });

    it('does not retry after a 404 (no game started yet)', async () => {
        vi.useFakeTimers();
        try {
            const service = TestBed.inject(GameStateService);
            const http = TestBed.inject(HttpTestingController);

            const promise = service.refreshGameState('PQXR7K');
            http.expectOne(gameStateUrl('PQXR7K')).flush('not found', {
                status: 404,
                statusText: 'Not Found'
            });
            await promise;

            await vi.advanceTimersByTimeAsync(5000);
            http.expectNone(gameStateUrl('PQXR7K'));
            expect(service.gameState()).toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });

    it('keeps retrying past the old 4-attempt cutoff instead of giving up permanently', async () => {
        vi.useFakeTimers();
        try {
            const service = TestBed.inject(GameStateService);
            const http = TestBed.inject(HttpTestingController);

            const promise = service.refreshGameState('PQXR7K');
            // Fail 6 times in a row -- one more than the old bounded-retry cutoff -- with the
            // capped 8s backoff comfortably covering each gap.
            for (let i = 0; i < 6; i++) {
                const request = await vi.waitFor(() => http.expectOne(gameStateUrl('PQXR7K')));
                request.flush('boom', { status: 500, statusText: 'Server Error' });
                await vi.advanceTimersByTimeAsync(8000);
            }

            const finalRequest = await vi.waitFor(() => http.expectOne(gameStateUrl('PQXR7K')));
            finalRequest.flush(makeState({ version: 7 }));
            await promise;

            expect(service.gameState()?.version).toBe(7);
        } finally {
            vi.useRealTimers();
        }
    });

    it('stopSync cancels a pending retry so it does not refetch a room the client already left', async () => {
        vi.useFakeTimers();
        try {
            const service = TestBed.inject(GameStateService);
            const http = TestBed.inject(HttpTestingController);

            const promise = service.refreshGameState('PQXR7K');
            const firstRequest = await vi.waitFor(() => http.expectOne(gameStateUrl('PQXR7K')));
            firstRequest.flush('boom', { status: 500, statusText: 'Server Error' });
            await promise;

            service.stopSync();
            await vi.advanceTimersByTimeAsync(10_000);
            http.expectNone(gameStateUrl('PQXR7K'));
        } finally {
            vi.useRealTimers();
        }
    });

    it('does not let a late, older response clobber a newer one already applied', async () => {
        const service = TestBed.inject(GameStateService);
        const http = TestBed.inject(HttpTestingController);

        const firstPromise = service.refreshGameState('PQXR7K');
        const firstRequest = http.expectOne(gameStateUrl('PQXR7K'));

        const secondPromise = service.refreshGameState('PQXR7K');
        const secondRequest = http.expectOne(gameStateUrl('PQXR7K'));

        // Newer request resolves first (out-of-order network resolution).
        secondRequest.flush(makeState({ version: 5 }));
        await secondPromise;
        expect(service.gameState()?.version).toBe(5);

        // Older, in-flight request resolves late and must not overwrite the newer state.
        firstRequest.flush(makeState({ version: 4 }));
        await firstPromise;
        expect(service.gameState()?.version).toBe(5);
    });
});
