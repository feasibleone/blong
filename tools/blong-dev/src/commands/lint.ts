import {fileURLToPath} from 'node:url';

import {lintCli} from '@feasibleone/blong-lint/cli.ts';

import {pinnedPrettier} from '../utils/prettierBin.ts';

// Tools bundled with blong-dev (cspell, eslint, tsc) live in blong-dev's own
// node_modules. lint.ts is at src/commands/lint.ts → ../../node_modules/.bin is
// the package root's bin dir.
const blongDevBin = fileURLToPath(new URL('../../node_modules/.bin', import.meta.url));

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
