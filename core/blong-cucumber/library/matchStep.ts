export function coerceMatchParam(p: string | undefined): unknown {
    if (p === undefined) return p;
    const n = Number(p);
    return Number.isFinite(n) && String(n) === p ? n : p;
}

/** Maps cucumber expression parameter tokens to their regex equivalents. */
const CUCUMBER_PARAM_PATTERNS: Record<string, string> = {
    '{int}': '(-?\\d+)',
    '{float}': '(-?\\d+(?:\\.\\d+)?)',
    '{word}': '(\\w+)',
    '{string}': '"([^"]*)"',
    '{}': '(.+)',
};

/**
 * Compiles a cucumber expression into a RegExp.
 *
 * Strategy:
 * 1. Replace cucumber expression tokens (`{int}`, `{float}`, etc.) with
 *    temporary null-byte placeholders, recording the corresponding regex.
 * 2. Escape all regex special characters in the remaining literal text.
 * 3. Restore the cucumber regex patterns from the placeholders.
 */
export function compileCucumberExpression(pattern: string): RegExp {
    const captured: string[] = [];

    // Step 1: replace known cucumber tokens with placeholders
    let result = pattern.replace(/\{(?:int|float|word|string|)\}/g, match => {
        const idx = captured.length;
        captured.push(CUCUMBER_PARAM_PATTERNS[match] ?? `\\{${match.slice(1, -1)}\\}`);
        // Use null-byte as delimiter — safe because patterns never contain \x00
        return `\x00${idx}\x00`;
    });

    // Step 2: escape regex special characters in the literal parts
    result = result.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Step 3: restore the captured regex patterns
    result = result.replace(/\x00(\d+)\x00/g, (_, idx) => captured[Number(idx)]);

    return new RegExp('^' + result + '$');
}

export function matchStep(
    stepText: string,
    patterns: Map<string | RegExp, string>,
): {patternKey: string | RegExp; params: unknown[]} | null {
    for (const [pattern] of patterns) {
        let regex: RegExp;
        if (pattern instanceof RegExp) {
            regex = pattern;
        } else {
            regex = compileCucumberExpression(pattern);
        }
        const match = regex.exec(stepText);
        if (match) {
            const params = match.slice(1).map(coerceMatchParam);
            return {patternKey: pattern, params};
        }
    }
    return null;
}
