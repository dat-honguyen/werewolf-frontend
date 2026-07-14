const SUFFIX_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

function randomSuffix(length = 2): string {
    let suffix = '';
    for (let i = 0; i < length; i++) {
        suffix += SUFFIX_CHARS[Math.floor(Math.random() * SUFFIX_CHARS.length)];
    }
    return suffix;
}

/**
 * Returns `baseName` unchanged if it doesn't collide with `takenNames`.
 * Otherwise disambiguates it with a random "_xk"-style suffix, falling back
 * to an incrementing numeric suffix if collisions persist.
 */
export function resolveUniqueDisplayName(baseName: string, takenNames: string[]): string {
    const taken = new Set(takenNames.map((name) => name.trim().toLowerCase()));
    if (!taken.has(baseName.trim().toLowerCase())) {
        return baseName;
    }

    for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = `${baseName}_${randomSuffix()}`;
        if (!taken.has(candidate.trim().toLowerCase())) {
            return candidate;
        }
    }

    let counter = 2;
    let candidate = `${baseName}${counter}`;
    while (taken.has(candidate.trim().toLowerCase())) {
        counter++;
        candidate = `${baseName}${counter}`;
    }
    return candidate;
}
