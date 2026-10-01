import {existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

import {lintCli} from '@feasibleone/blong-lint/cli.ts';

import {findUp} from '../utils/findConfig.ts';

// Tools bundled with blong-dev (cspell, eslint, tsc) live in blong-dev's own
// node_modules. lint.ts is at src/commands/lint.ts → ../../node_modules/.bin is
// the package root's bin dir.
const blongDevBin = fileURLToPath(new URL('../../node_modules/.bin', import.meta.url));

/**
 * The prettier a `--fix` run must use, or `undefined` when it is not installed.
 *
 * The repository pins prettier v3 in the rush-prettier autoinstaller, while a
 * package's own `node_modules/.bin/prettier` is often a different major that
 * rewrites list markers, trailing commas and prose wraps across a whole file (the
 * F-241 friction). So the pinned copy is named explicitly and never guessed at.
 */
function pinnedPrettier(): string | undefined {
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

/**
 * Run lint tools in the current working directory.
 *
 * `blong-dev` bundles its own cspell/eslint/tsc, so its bin directory is passed
 * through to be preferred, along with the pinned prettier. Everything else —
 * argument parsing, tool discovery, output parsing, terminal presentation and the
 * exit code — belongs to `@feasibleone/blong-lint`, which uses the same entry
 * point to lint itself.
 *
 * @param args - The command line as typed, after `lint`. Bare paths, `--files
 *   a,b`, repeated `--files` and `--fix` are all understood. When no path is
 *   named, every tool runs with its whole-package scope.
 */
export async function lint(args: string[]): Promise<void> {
    const prettierBin = pinnedPrettier();
    await lintCli(args, {
        binPaths: [blongDevBin],
        ...(prettierBin ? {prettierBin} : {}),
    });
}
