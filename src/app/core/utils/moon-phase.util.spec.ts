import { moonPhaseFor } from './moon-phase.util';

describe('moonPhaseFor', () => {
    it('defaults to crescent when the night number is unknown', () => {
        expect(moonPhaseFor(undefined)).toBe('crescent');
        expect(moonPhaseFor(null)).toBe('crescent');
        expect(moonPhaseFor(0)).toBe('crescent');
    });

    it('advances through the cycle with the night number', () => {
        expect(moonPhaseFor(1)).toBe('crescent');
        expect(moonPhaseFor(2)).toBe('firstQuarter');
        expect(moonPhaseFor(3)).toBe('gibbous');
        expect(moonPhaseFor(4)).toBe('full');
        expect(moonPhaseFor(5)).toBe('waning');
    });

    it('wraps back to crescent after a full 5-night cycle', () => {
        expect(moonPhaseFor(6)).toBe('crescent');
        expect(moonPhaseFor(11)).toBe('crescent');
    });
});
