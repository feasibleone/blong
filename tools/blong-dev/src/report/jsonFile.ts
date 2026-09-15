/**
 * Small helper for reading JSON files defensively.
 */

import {existsSync, readFileSync} from 'node:fs';

/** Read and parse a JSON file, returning `null` when missing or malformed. */
export function readJson<T>(file: string): T | null {
    if (!existsSync(file)) return null;
    try {
        return JSON.parse(readFileSync(file, 'utf8')) as T;
    } catch {
        return null;
    }
}
