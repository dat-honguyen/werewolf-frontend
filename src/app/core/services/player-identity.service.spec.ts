import { TestBed } from '@angular/core/testing';
import { PlayerIdentityService } from './player-identity.service';

describe('PlayerIdentityService', () => {
    beforeEach(() => {
        localStorage.clear();
        TestBed.configureTestingModule({});
    });

    it('generates a playerId once and persists it across re-instantiation', () => {
        const first = TestBed.inject(PlayerIdentityService);
        const generatedId = first.playerId();
        expect(generatedId).toBeTruthy();

        TestBed.resetTestingModule();
        const second = TestBed.inject(PlayerIdentityService);
        expect(second.playerId()).toBe(generatedId);
    });

    it('persists the display name across re-instantiation', () => {
        const first = TestBed.inject(PlayerIdentityService);
        first.setDisplayName('Alice');

        TestBed.resetTestingModule();
        const second = TestBed.inject(PlayerIdentityService);
        expect(second.displayName()).toBe('Alice');
    });
});
