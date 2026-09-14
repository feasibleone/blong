/**
 * Log levels (PRD R17 parity rows "log levels" and "level threshold filtering").
 *
 * The numeric values are the monorepo-wide convention and must not drift.
 */

export type LevelName = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export const LEVELS: Readonly<Record<LevelName, number>> = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
    fatal: 60,
};

export const LEVEL_NAMES: Readonly<Record<number, LevelName>> = {
    10: 'trace',
    20: 'debug',
    30: 'info',
    40: 'warn',
    50: 'error',
    60: 'fatal',
};

/** Resolve a level name or number to its numeric value. */
export function levelValue(level: LevelName | number): number {
    return typeof level === 'number' ? level : LEVELS[level];
}

/** Resolve a numeric value to a name, falling back to the raw value. */
export function levelName(value: number): LevelName | string {
    return LEVEL_NAMES[value] ?? String(value);
}

/** True when `level` is at or above `threshold` (both inclusive). */
export function enabled(level: LevelName | number, threshold: LevelName | number): boolean {
    return levelValue(level) >= levelValue(threshold);
}
