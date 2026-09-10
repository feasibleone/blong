import {existsSync} from 'node:fs';
import {dirname, join} from 'node:path';

/**
 * Walks up the directory tree from `startDir` looking for `filename`.
 * Returns the absolute path of the first match, or undefined if not found.
 */
export function findUp(startDir: string, filename: string): string | undefined {
    let dir = startDir;
    for (;;) {
        const candidate = join(dir, filename);
        if (existsSync(candidate)) return candidate;
        const parent = dirname(dir);
        if (parent === dir) return undefined; // filesystem root
        dir = parent;
    }
}
