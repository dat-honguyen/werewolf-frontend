import { phaseFamily, shouldShowPhaseTransition } from './phase-family.util';

describe('phaseFamily', () => {
    it('groups role-reveal and night into the same family', () => {
        expect(phaseFamily('role-reveal')).toBe(phaseFamily('night'));
    });

    it('groups day-discussion and voting into the same family', () => {
        expect(phaseFamily('day-discussion')).toBe(phaseFamily('voting'));
    });

    it('keeps night and day in different families', () => {
        expect(phaseFamily('night')).not.toBe(phaseFamily('day-discussion'));
    });

    it('keeps hunter-revenge in its own family', () => {
        expect(phaseFamily('hunter-revenge')).not.toBe(phaseFamily('night'));
        expect(phaseFamily('hunter-revenge')).not.toBe(phaseFamily('day-discussion'));
    });
});

describe('shouldShowPhaseTransition', () => {
    it('never fires on initial mount (no previous view)', () => {
        expect(shouldShowPhaseTransition(null, 'lobby')).toBe(false);
    });

    it('does not fire within the same family', () => {
        expect(shouldShowPhaseTransition('day-discussion', 'voting')).toBe(false);
    });

    it('fires when night turns to day', () => {
        expect(shouldShowPhaseTransition('night', 'day-discussion')).toBe(true);
    });

    it('fires entering and leaving hunter-revenge', () => {
        expect(shouldShowPhaseTransition('day-discussion', 'hunter-revenge')).toBe(true);
        expect(shouldShowPhaseTransition('hunter-revenge', 'night')).toBe(true);
    });

    it('fires when the game ends', () => {
        expect(shouldShowPhaseTransition('voting', 'game-over')).toBe(true);
    });
});
