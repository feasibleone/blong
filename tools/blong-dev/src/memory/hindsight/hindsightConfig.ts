/**
 * Where the Hindsight server is, and whether to talk to it at all.
 *
 * The memory tree on disk is the source of truth and the Hindsight bank is a
 * derived index, so every setting here has a usable default and one switch turns
 * the whole thing off. Configuration comes from the environment first — a single
 * command can point at another server — and from `.blong_devrc` second, matching
 * how `blong-dev sql` resolves its connection.
 */

import {getPath, loadDevRc} from '../../devrc.ts';

/** Default API base URL — the port `plans/memory-index/hindsight.sh` publishes. */
export const DEFAULT_HINDSIGHT_URL = 'http://localhost:8888';

/** Default bank: one index for the whole repository. */
export const DEFAULT_HINDSIGHT_BANK = 'blong';

/** A resolved Hindsight configuration. */
export interface IHindsightConfig {
    /** False when the index is switched off; callers then do nothing at all. */
    enabled: boolean;
    /** API base URL, without a trailing slash. */
    url: string;
    /** Bank to read and write. */
    bank: string;
}

/** Values that turn the index off, so `HINDSIGHT_DISABLED=0` leaves it on. */
const OFF_VALUES = new Set(['1', 'true', 'yes', 'on']);

/** Read `.blong_devrc` without letting a malformed file break a memory write. */
function devRcConfig(): Record<string, unknown> | undefined {
    try {
        return loadDevRc()?.config;
    } catch {
        return undefined;
    }
}

/**
 * Resolve the configuration from the environment and `.blong_devrc`.
 *
 * The environment wins over the file, and the file over the built-in default, so
 * `HINDSIGHT_API_URL=… blong-dev memory search …` overrides a stored setting for
 * exactly one command.
 */
export function resolveHindsightConfig(
    env: Record<string, string | undefined> = process.env,
    rc: Record<string, unknown> | undefined = devRcConfig(),
): IHindsightConfig {
    const fromFile = (key: string): string | undefined => {
        const value = rc ? getPath(rc, `hindsight.${key}`) : undefined;
        return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
    };

    const url = (env['HINDSIGHT_API_URL'] ?? fromFile('url') ?? DEFAULT_HINDSIGHT_URL).trim();
    const bank = (env['HINDSIGHT_BANK'] ?? fromFile('bank') ?? DEFAULT_HINDSIGHT_BANK).trim();
    const off = (env['HINDSIGHT_DISABLED'] ?? '').trim().toLowerCase();

    return {
        enabled: !OFF_VALUES.has(off) && url !== '',
        url: url.replace(/\/+$/, ''),
        bank: bank === '' ? DEFAULT_HINDSIGHT_BANK : bank,
    };
}
