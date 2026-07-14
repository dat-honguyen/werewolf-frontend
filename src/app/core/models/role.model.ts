export type Role =
    'Villager' | 'Werewolf' | 'Seer' | 'Doctor' | 'Hunter' | 'Witch' | 'Cupid' | 'Tanner';

export interface RoleInfo {
    role: Role;
    faction: string;
    description: string;
}

export interface RulesResponse {
    overview: string;
    phases: { phase: string; description: string }[];
    nightActionOrder: string[];
    winConditions: string[];
    settings: { name: string; default: string; description: string }[];
    roles: RoleInfo[];
}
