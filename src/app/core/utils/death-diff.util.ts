export interface AliveFlag {
    playerId: string;
    isAlive: boolean;
}

/**
 * Diffs two alive-flag snapshots and returns the IDs that flipped alive -> dead between them --
 * drives a transient "dying" animation class instead of PlayerGrid entries cutting straight to
 * the static dead style the instant GameStateService's resync lands. `prev === null` (no earlier
 * snapshot for this game yet -- first render, or a fresh mount after a reconnect) never reports a
 * death: without this guard, every player already dead before this client connected would be
 * misreported as "just died" and replay the death animation on page load.
 */
export function diffNewlyDead(
    prev: readonly AliveFlag[] | null,
    next: readonly AliveFlag[]
): Set<string> {
    const result = new Set<string>();
    if (!prev) {
        return result;
    }
    const prevAlive = new Map(prev.map((p) => [p.playerId, p.isAlive]));
    for (const player of next) {
        if (prevAlive.get(player.playerId) === true && !player.isAlive) {
            result.add(player.playerId);
        }
    }
    return result;
}
