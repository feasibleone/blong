/**
 * Snapshot helper for TAP-based tests.
 *
 * Provides a thin wrapper around `t.matchSnapshot()` that applies flat
 * dot-path masking before comparison, eliminating the need for manual
 * normalisation (e.g. replacing dynamic ports or ULIDs) in every test file.
 *
 * Usage:
 *
 * ```typescript
 * import {snapshot} from '@feasibleone/blong-chain/snapshot';
 *
 * t.test('my test', async t => {
 *     const result = await myApiCall();
 *     snapshot(t, result, 'my-test', {mask: ['createdAt', 'user.userId']});
 * });
 * ```
 *
 * The `mask` option accepts an array of dot-delimited paths. Each matching
 * leaf value is replaced with the string `'<masked>'` before the snapshot is
 * taken. Glob-style wildcards (`*.field`) are not yet supported.
 */

/** Minimal interface for a TAP test context (compatible with tap, node:test, etc.) */
export interface ISnapshotContext {
    matchSnapshot(value: unknown, name?: string): void;
}

/** Options accepted by the {@link snapshot} helper */
export interface ISnapshotOptions {
    /**
     * Dot-delimited paths whose leaf values should be replaced with
     * `'<masked>'` before comparison.
     *
     * Examples:
     * - `'completedAt'`  — top-level field
     * - `'user.userId'`  — nested field
     * - `'createParty.partyId'` — step-scoped path in a chain context
     */
    mask?: string[];
}

/**
 * Take a snapshot of `value` using the TAP test context `t`.
 *
 * Dynamic fields listed in `opts.mask` are replaced with `'<masked>'` so
 * that timestamps, IDs, and other non-deterministic values do not cause false
 * failures on subsequent runs.
 */
export function snapshot(
    t: ISnapshotContext,
    value: unknown,
    name: string,
    opts: ISnapshotOptions = {},
): void {
    const masked = opts.mask?.length ? maskPaths(value, opts.mask) : value;
    t.matchSnapshot(masked, name);
}

/**
 * Return a deep clone of `value` with the specified dot-path fields replaced
 * by `'<masked>'`.
 *
 * Only JSON-serialisable values are supported (the clone is performed via
 * `JSON.parse(JSON.stringify(value))`).
 */
export function maskPaths(value: unknown, paths: string[]): unknown {
    if (value === null || value === undefined || typeof value !== 'object') {
        return value;
    }

    // Deep clone via JSON round-trip (safe for plain data objects)
    const clone = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;

    for (const path of paths) {
        setAtPath(clone, path.split('.'));
    }

    return clone;
}

/** Recursively navigate `obj` along `parts` and replace the leaf with `'<masked>'` */
function setAtPath(obj: unknown, parts: string[]): void {
    if (typeof obj !== 'object' || obj === null || parts.length === 0) return;

    const [head, ...tail] = parts;
    // Skip prototype-polluting keys to prevent prototype chain manipulation
    if (head === '__proto__' || head === 'constructor' || head === 'prototype') return;

    const record = obj as Record<string, unknown>;

    if (tail.length === 0) {
        if (Object.prototype.hasOwnProperty.call(record, head)) {
            record[head] = '<masked>';
        }
    } else {
        setAtPath(record[head], tail);
    }
}
