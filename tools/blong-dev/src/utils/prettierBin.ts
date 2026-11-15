/**
 * The prettier a repair pass must use.
 *
 * The repository pins prettier v3 in the rush-prettier autoinstaller, while a package's own
 * `node_modules/.bin/prettier` is often a different major that rewrites list markers, trailing
 * commas and prose wraps across a whole file (the F-241 friction). So the pinned copy is named
 * explicitly and never guessed at — a repair that silently reformats a file the author did not
 * touch is worse than no repair.
 */

import {existsSync} from 'node:fs';
import {dirname, join} from 'node:path';

import {findUp} from './findConfig.ts';

/** The pinned prettier's path, or `undefined` when the autoinstaller is not installed. */
export function pinnedPrettier(): string | undefined {
    const rush = findUp(process.cwd(), 'rush.json');
    if (!rush) return undefined;
    const exe = process.platform === 'win32' ? 'prettier.cmd' : 'prettier';
    const bin = join(
        dirname(rush),
        'common',
        'autoinstallers',
        'rush-prettier',
        'node_modules',
        '.bin',
        exe,
    );
    return existsSync(bin) ? bin : undefined;
}
