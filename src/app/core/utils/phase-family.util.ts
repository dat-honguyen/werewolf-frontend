import { GameView } from '../services/game-state.service';

export type PhaseFamily = 'lobby' | 'night' | 'day' | 'hunter-revenge' | 'game-over';

const FAMILY: Record<GameView, PhaseFamily> = {
    lobby: 'lobby',
    'role-reveal': 'night',
    night: 'night',
    'day-discussion': 'day',
    voting: 'day',
    'hunter-revenge': 'hunter-revenge',
    'game-over': 'game-over'
};

export function phaseFamily(view: GameView): PhaseFamily {
    return FAMILY[view];
}

/**
 * Whether crossing from `prev` to `next` should fire the full-screen phase-transition overlay --
 * only on a family change (day -> night), not sub-view churn within the same family
 * (day-discussion -> voting stays "day"). `prev === null` is the initial mount, which never fires
 * the overlay since there's nothing to transition *from* yet.
 */
export function shouldShowPhaseTransition(prev: GameView | null, next: GameView): boolean {
    if (prev === null) {
        return false;
    }
    return phaseFamily(prev) !== phaseFamily(next);
}
