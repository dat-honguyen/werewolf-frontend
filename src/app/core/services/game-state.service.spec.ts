import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GameStateResponse } from '../models/game.model';
import { GameStateService } from './game-state.service';

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
        version: 0,
        ...overrides
    };
}

describe('GameStateService', () => {
    beforeEach(() => {
        localStorage.clear();
        TestBed.configureTestingModule({
            providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
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
});
