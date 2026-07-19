import { diffNewlyDead } from './death-diff.util';

describe('diffNewlyDead', () => {
    it('reports nothing on the first snapshot (prev is null)', () => {
        expect(diffNewlyDead(null, [{ playerId: 'a', isAlive: false }])).toEqual(new Set());
    });

    it('reports a player who flipped from alive to dead', () => {
        const prev = [
            { playerId: 'a', isAlive: true },
            { playerId: 'b', isAlive: true }
        ];
        const next = [
            { playerId: 'a', isAlive: false },
            { playerId: 'b', isAlive: true }
        ];
        expect(diffNewlyDead(prev, next)).toEqual(new Set(['a']));
    });

    it('does not re-report a player who was already dead', () => {
        const prev = [{ playerId: 'a', isAlive: false }];
        const next = [{ playerId: 'a', isAlive: false }];
        expect(diffNewlyDead(prev, next)).toEqual(new Set());
    });

    it('reports multiple simultaneous deaths (e.g. a night kill + a hunter shot)', () => {
        const prev = [
            { playerId: 'a', isAlive: true },
            { playerId: 'b', isAlive: true }
        ];
        const next = [
            { playerId: 'a', isAlive: false },
            { playerId: 'b', isAlive: false }
        ];
        expect(diffNewlyDead(prev, next)).toEqual(new Set(['a', 'b']));
    });

    it('ignores a player present in next but absent from prev', () => {
        const prev: { playerId: string; isAlive: boolean }[] = [];
        const next = [{ playerId: 'a', isAlive: false }];
        expect(diffNewlyDead(prev, next)).toEqual(new Set());
    });
});
