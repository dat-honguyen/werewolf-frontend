export type MoonPhase = 'crescent' | 'firstQuarter' | 'gibbous' | 'full' | 'waning';

const CYCLE: readonly MoonPhase[] = ['crescent', 'firstQuarter', 'gibbous', 'full', 'waning'];

/**
 * Cosmetic-only: cycles the phase-transition overlay's moon disc through a waxing-to-full-to-
 * waning sequence keyed off the in-game night number, so it doubles as a "which night is this"
 * cue without being load-bearing game state -- nightNumber (from GameStateResponse) stays the
 * source of truth; this is purely derived. Falls back to the first phase for an unknown/zero
 * night number rather than throwing, so a transition fired before nightNumber is known (e.g.
 * lobby -> role-reveal) still renders something.
 */
export function moonPhaseFor(nightNumber: number | null | undefined): MoonPhase {
    if (!nightNumber || nightNumber < 1) {
        return CYCLE[0];
    }
    return CYCLE[(nightNumber - 1) % CYCLE.length];
}
