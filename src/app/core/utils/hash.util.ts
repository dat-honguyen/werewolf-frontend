/** Deterministic djb2 string hash — same seed always produces the same avatar/sigil. */
export function hashString(seed: string): number {
    let hash = 5381;
    for (let i = 0; i < seed.length; i++) {
        hash = (hash * 33) ^ seed.charCodeAt(i);
    }
    return hash >>> 0;
}

export function pick<T>(items: readonly T[], seed: string, salt = ''): T {
    const hash = hashString(seed + salt);
    return items[hash % items.length];
}
