export type ActionIconKey = 'readyUp' | 'unready' | 'cancelLobby' | 'leaveLobby';

/** Inline SVG inner-markup (viewBox 0 0 24 24) for the lobby action panel's Ready Up/UnReady/
 * Cancel Lobby/Leave Lobby buttons -- thin-stroke geometric marks matching AVATAR_SIGILS'
 * occult-symbol style (role-icon.util.ts's AVATAR_SIGILS), replacing generic emoji so these read
 * as part of the app's own icon language instead of a default emoji-picker glyph. */
export const ACTION_ICON: Record<ActionIconKey, string> = {
    // Circled checkmark -- readiness confirmed.
    readyUp: `<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 12.3l2.6 2.6L16.2 9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`,
    // Hourglass -- waiting/not yet ready.
    unready: `<path d="M7 3h10M7 21h10M8 3c0 4 3 6 4 6s4-2 4-6M8 21c0-4 3-6 4-6s4 2 4 6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`,
    // Circled slash -- a prohibition/void mark for canceling the whole lobby.
    cancelLobby: `<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.4"/><line x1="5.8" y1="5.8" x2="18.2" y2="18.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`,
    // Open door with an exit arrow.
    leaveLobby: `<path d="M9 4H5v16h4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 12h9m0 0-3-3m3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`
};
