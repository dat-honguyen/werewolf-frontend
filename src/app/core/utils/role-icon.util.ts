import { Role } from '../models/role.model';

/** Inline SVG inner-markup (viewBox 0 0 24 24) for each role's card medallion glyph. */
export const ROLE_ICON: Record<Role, string> = {
    Villager: `<path d="M12 2 9 9h6L12 2Z" fill="currentColor"/><rect x="10.5" y="9" width="3" height="10" rx="1" fill="currentColor"/><path d="M8 21c0-2 2-3 4-3s4 1 4 3" fill="none" stroke="currentColor" stroke-width="1.3"/>`,
    Werewolf: `<path d="M15.8 3A9 9 0 1 0 15.8 21 7.2 7.2 0 0 1 15.8 3Z" fill="currentColor" fill-opacity=".55"/><g stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="5" y1="4" x2="9" y2="20"/><line x1="8" y1="3" x2="12" y2="19"/><line x1="11" y1="2" x2="15" y2="18"/></g>`,
    Seer: `<path d="M2 12S6 5.5 12 5.5 22 12 22 12 18 18.5 12 18.5 2 12 2 12Z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="12" cy="12" r="3" fill="currentColor"/><g stroke="currentColor" stroke-width="1" stroke-linecap="round"><line x1="12" y1="1" x2="12" y2="3.5"/><line x1="12" y1="20.5" x2="12" y2="23"/></g>`,
    Doctor: `<rect x="10" y="3" width="4" height="14" rx="1" fill="currentColor"/><rect x="5" y="8" width="14" height="4" rx="1" fill="currentColor"/>`,
    Hunter: `<path d="M3 12h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M17 12l-4-3M17 12l-4 3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 6c2 2 2 4 0 6M6 18c2-2 2-4 0-6" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>`,
    Witch: `<path d="M4 11h16l-2 8H6l-2-8Z" fill="currentColor"/><ellipse cx="12" cy="11" rx="8" ry="2" fill="currentColor"/><circle cx="9" cy="5" r="1" fill="currentColor"/><circle cx="13" cy="3" r="1.2" fill="currentColor"/><circle cx="15.5" cy="6" r="0.8" fill="currentColor"/>`,
    Cupid: `<path d="M12 20s-7-4.5-7-10a4.5 4.5 0 0 1 7-3.7A4.5 4.5 0 0 1 19 10c0 5.5-7 10-7 10Z" fill="currentColor" fill-opacity=".85"/><path d="M2 6l20 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>`,
    Tanner: `<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`
};

/** Mystical sigils used for randomized player avatars — deliberately abstract (not literal
 * creatures) so they read as "occult symbol" rather than implying a role before reveal. */
export const AVATAR_SIGILS: readonly string[] = [
    // crescent moon + spark
    `<path d="M15.8 2.5A9.5 9.5 0 1 0 15.8 21.5 7.6 7.6 0 0 1 15.8 2.5Z" fill="currentColor"/><path d="M19.5 4l.7 1.8L22 6.5l-1.8.7L19.5 9l-.7-1.8L17 6.5l1.8-.7Z" fill="currentColor"/>`,
    // hexagram
    `<path d="M12 2.5 20 17H4Z" fill="currentColor" fill-opacity=".9"/><path d="M12 21.5 4 7h16Z" fill="currentColor" fill-opacity=".9"/>`,
    // all-seeing eye
    `<path d="M2 12S6 5.5 12 5.5 22 12 22 12 18 18.5 12 18.5 2 12 2 12Z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="12" cy="12" r="3" fill="currentColor"/>`,
    // triquetra
    `<circle cx="12" cy="7.5" r="5.4" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="15" r="5.4" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="16" cy="15" r="5.4" fill="none" stroke="currentColor" stroke-width="1.3"/>`,
    // pentagram
    `<path d="M12 2 14.5 9.3 22 9.3 15.9 13.9 18.2 21 12 16.6 5.8 21 8.1 13.9 2 9.3 9.5 9.3Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>`,
    // sunburst
    `<circle cx="12" cy="12" r="4" fill="currentColor"/><g stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><line x1="12" y1="1" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="1" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="23" y2="12"/><line x1="4.2" y1="4.2" x2="7" y2="7"/><line x1="17" y1="17" x2="19.8" y2="19.8"/><line x1="4.2" y1="19.8" x2="7" y2="17"/><line x1="17" y1="7" x2="19.8" y2="4.2"/></g>`,
    // serpent
    `<path d="M6 3c0 3 6 3 6 6s-6 3-6 6 6 3 6 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="6" cy="3" r="1.4" fill="currentColor"/>`,
    // raven wings
    `<path d="M2 14c4-6 8-8 10-8s6 2 10 8c-4-2-7-3-10-1-3-2-6-1-10 1Z" fill="currentColor"/>`
];

/** Jewel-tone palette shared with the faction colors, so avatars feel native to the theme even
 * before a player's actual role/faction is known. */
export const AVATAR_PALETTE: readonly string[] = [
    'var(--color-faction-villager)',
    'var(--color-faction-werewolf)',
    'var(--color-faction-seer)',
    'var(--color-faction-doctor)',
    'var(--color-faction-witch)',
    'var(--color-faction-cupid)',
    'var(--color-faction-hunter)',
    'var(--color-faction-tanner)'
];
