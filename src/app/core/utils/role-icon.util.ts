import { Role } from '../models/role.model';

/** Inline SVG inner-markup (viewBox 0 0 24 24) for each role's card portrait -- small illustrated
 * scenes rather than flat glyphs, using only currentColor + fill-opacity so they recolor with the
 * card's faction glow without needing extra CSS variables per role. */
export const ROLE_ICON: Record<Role, string> = {
    // Hooded figure holding a lantern -- an ordinary townsperson keeping watch.
    Villager: `<path d="M12 3 8.5 10h7L12 3Z" fill="currentColor"/><path d="M9.5 10c-1 3-1 8 0 11h5c1-3 1-8 0-11" fill="currentColor" fill-opacity=".75"/><circle cx="17" cy="15" r="2.2" fill="none" stroke="currentColor" stroke-width="1.1"/><line x1="17" y1="12.8" x2="17" y2="11.5" stroke="currentColor" stroke-width="1.1"/><circle cx="17" cy="15" r=".6" fill="currentColor"/>`,
    // Snarling wolf head, ears back, under a crescent moon.
    Werewolf: `<path d="M19 3.5a6 6 0 0 1-5 5.7A6 6 0 0 1 19 3.5Z" fill="currentColor" fill-opacity=".55"/><path d="M6 9l-1.5-5L8 7l4-3 4 3 3.5-3L18 9c1.5 2 1.5 5-1 7.5-1.6 1.6-3.4 2.5-5 2.5s-3.4-.9-5-2.5C4.5 14 4.5 11 6 9Z" fill="currentColor"/><path d="M9 12.5l1.3 1.7L12 13l1.7 1.2L15 12.5" fill="none" stroke="var(--color-bg-void, #000)" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.3" cy="10.8" r=".8" fill="var(--color-bg-void, #000)"/><circle cx="14.7" cy="10.8" r=".8" fill="var(--color-bg-void, #000)"/>`,
    // Crystal ball with an all-seeing eye swirling inside, resting on a small stand.
    Seer: `<path d="M9 20h6l1 2H8Z" fill="currentColor"/><circle cx="12" cy="11" r="7.5" fill="currentColor" fill-opacity=".18" stroke="currentColor" stroke-width="1.2"/><path d="M5.5 11S8 7 12 7s6.5 4 6.5 4-2.5 4-6.5 4-6.5-4-6.5-4Z" fill="currentColor" fill-opacity=".85"/><circle cx="12" cy="11" r="2" fill="var(--color-bg-void, #000)"/>`,
    // Mortar, pestle, and a healing herb sprig.
    Doctor: `<path d="M6 14a6 6 0 0 0 12 0Z" fill="currentColor"/><ellipse cx="12" cy="14" rx="7.5" ry="1.6" fill="currentColor" fill-opacity=".5"/><rect x="10.8" y="2" width="2.4" height="9" rx="1.2" fill="currentColor" transform="rotate(18 12 6.5)"/><path d="M9 5c1.5 1 1.8 2.6 1 4-1.7-.2-2.7-1.4-3-3Z" fill="currentColor" fill-opacity=".7"/>`,
    // Drawn longbow with fletched arrow and a feather trailing off the string.
    Hunter: `<path d="M6 3c-3 4-3 14 0 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="6" y1="3" x2="17" y2="12" stroke="currentColor" stroke-width="1" stroke-dasharray="1.5 1.5"/><line x1="6" y1="21" x2="17" y2="12" stroke="currentColor" stroke-width="1" stroke-dasharray="1.5 1.5"/><line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M20 12l-3.2-1.4v2.8Z" fill="currentColor"/>`,
    // Bubbling cauldron with a witch's hat resting on the rim.
    Witch: `<path d="M4 12h16l-1.6 7.5a2 2 0 0 1-2 1.5H7.6a2 2 0 0 1-2-1.5Z" fill="currentColor"/><ellipse cx="12" cy="12" rx="8" ry="2.1" fill="currentColor" fill-opacity=".6"/><path d="M9.5 8 12 2l2.5 6Z" fill="currentColor" fill-opacity=".85"/><ellipse cx="12" cy="8" rx="3.4" ry="1" fill="currentColor" fill-opacity=".85"/><circle cx="9" cy="15.5" r=".7" fill="var(--color-bg-void, #000)"/><circle cx="12.5" cy="17" r=".9" fill="var(--color-bg-void, #000)"/><circle cx="15" cy="15" r=".6" fill="var(--color-bg-void, #000)"/>`,
    // Winged heart pierced clean through by an arrow.
    Cupid: `<path d="M12 20.5s-7.2-4.6-7.2-10.3A4.6 4.6 0 0 1 12 6.6a4.6 4.6 0 0 1 7.2 3.6c0 5.7-7.2 10.3-7.2 10.3Z" fill="currentColor" fill-opacity=".85"/><path d="M2 4c2 .5 3.4 1.8 4 3.5-1.8.4-3.5-.4-4-3.5Z" fill="currentColor" fill-opacity=".6"/><path d="M22 4c-2 .5-3.4 1.8-4 3.5 1.8.4 3.5-.4 4-3.5Z" fill="currentColor" fill-opacity=".6"/><line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" stroke-width="1.1"/><path d="M21 9l-3-1.6v3.2Z" fill="currentColor"/>`,
    // A hangman's noose -- the Tanner's whole aim is to be executed by the village.
    Tanner: `<path d="M12 2v5" stroke="currentColor" stroke-width="1.3"/><path d="M6.5 3.5h11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M12 7v3.2M9.6 12.8l1.6 2 2.4-3.2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`
};

/** Mystical sigils used for randomized player avatars — deliberately abstract (not literal
 * creatures) so they read as "occult symbol" rather than implying a role before reveal. */
export const AVATAR_SIGILS: readonly string[] = [
    // crescent moon + spark
    `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" fill="currentColor"/><path d="M6.5 5l.7 1.8L9 7.5l-1.8.7L6.5 10l-.7-1.8L4 7.5l1.8-.7Z" fill="currentColor"/>`,
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
