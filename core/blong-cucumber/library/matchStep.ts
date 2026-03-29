export function coerceMatchParam(p: string | undefined): unknown {
    if (p === undefined) return p;
    const n = Number(p);
    return Number.isFinite(n) && String(n) === p ? n : p;
}

export function compileCucumberExpression(pattern: string): RegExp {
    let regexStr = pattern
        .replace(/[.*+?^${}()|[\]\\]/g, m => {
            // Don't escape braces that are part of cucumber expressions
            if (m === '{' || m === '}') return m;
            return '\\' + m;
        })
        .replace(/\{int\}/g, '(-?\\d+)')
        .replace(/\{float\}/g, '(-?\\d+(?:\\.\\d+)?)')
        .replace(/\{word\}/g, '(\\w+)')
        .replace(/\{string\}/g, '"([^"]*)"')
        .replace(/\{\}/g, '(.+)');
    // Escape any remaining braces (from non-cucumber-expression uses)
    regexStr = regexStr.replace(/[{}]/g, m => '\\' + m);
    return new RegExp('^' + regexStr + '$');
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
