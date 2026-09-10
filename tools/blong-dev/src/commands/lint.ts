import {fileURLToPath} from 'node:url';

import {lintCli} from '@feasibleone/blong-lint/cli.ts';

// Tools bundled with blong-dev (cspell, eslint, tsc) live in blong-dev's own
// node_modules. lint.ts is at src/commands/lint.ts → ../../node_modules/.bin is
// the package root's bin dir.
const blongDevBin = fileURLToPath(new URL('../../node_modules/.bin', import.meta.url));

/**
 * Run lint tools in the current working directory.
 *
 * `blong-dev` bundles its own cspell/eslint/tsc, so its bin directory is passed
 * through to be preferred. Everything else — tool discovery, output parsing,
 * terminal presentation and the exit code — belongs to `@feasibleone/blong-lint`,
 * which uses the same entry point to lint itself.
 *
 * @param fileArgs - Optional list of files to lint (paths relative to CWD).
 *   When supplied (staged-file mode), cspell and eslint are scoped to those
 *   files only while tsc still type-checks the whole package.
 *   When omitted (full-package mode), all tools run with their default scope.
 */
export async function lint(fileArgs: string[]): Promise<void> {
    await lintCli(fileArgs, {binPaths: [blongDevBin]});
}
