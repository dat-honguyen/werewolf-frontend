import { Role } from '../models/role.model';

/**
 * Faction accent colors, one per role. Values match the classic-theme --color-faction-* custom
 * properties already defined in src/styles/abstracts/_design-tokens.scss -- kept as plain hex
 * here (rather than var() references) because RoomShell and IdentityGrimoireCard render inside
 * their own local --primary/--accent-day/--accent-night token set, not that global palette.
 */
export const ROLE_ACCENT: Record<Role, string> = {
    Villager: '#c7d3e6',
    Werewolf: '#8f1c2e',
    Seer: '#5aa9a3',
    Doctor: '#6f9e5e',
    Witch: '#7a5ea8',
    Cupid: '#c2679a',
    Hunter: '#b06a2e',
    Tanner: '#9aa332'
};

export function roleAccent(role: Role | null): string | null {
    return role ? ROLE_ACCENT[role] : null;
}
