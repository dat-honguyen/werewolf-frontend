import { roleAccent, ROLE_ACCENT } from './role-accent.util';
import { Role } from '../models/role.model';

describe('roleAccent', () => {
    it('returns null when there is no role', () => {
        expect(roleAccent(null)).toBeNull();
    });

    it('returns the werewolf blood-red accent', () => {
        expect(roleAccent('Werewolf')).toBe('#8f1c2e');
    });

    it('has a valid hex accent for every role', () => {
        const roles: Role[] = [
            'Villager',
            'Werewolf',
            'Seer',
            'Doctor',
            'Hunter',
            'Witch',
            'Cupid',
            'Tanner'
        ];
        for (const role of roles) {
            expect(ROLE_ACCENT[role]).toMatch(/^#[0-9a-f]{6}$/);
            expect(roleAccent(role)).toBe(ROLE_ACCENT[role]);
        }
    });
});
