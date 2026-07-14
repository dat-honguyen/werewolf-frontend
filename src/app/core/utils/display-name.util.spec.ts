import { resolveUniqueDisplayName } from './display-name.util';

describe('resolveUniqueDisplayName', () => {
    it('returns the name unchanged when there is no collision', () => {
        expect(resolveUniqueDisplayName('Alice', ['Bob', 'Carol'])).toBe('Alice');
    });

    it('is case-insensitive when checking for collisions', () => {
        const result = resolveUniqueDisplayName('alice', ['Alice']);
        expect(result).not.toBe('alice');
    });

    it('appends a random suffix when the name collides', () => {
        const result = resolveUniqueDisplayName('Alice', ['Alice']);
        expect(result).toMatch(/^Alice_[a-z0-9]{2}$/);
    });

    it('falls back to an incrementing number if random suffixes keep colliding', () => {
        const taken = [
            'alice',
            ...Array.from({ length: 36 * 36 }, (_, i) => `alice_${i.toString(36).padStart(2, '0')}`)
        ];
        const result = resolveUniqueDisplayName('Alice', taken);
        expect(result).toBe('Alice2');
    });
});
