#!/usr/bin/env -S node
/**
 * Run this package's tests — the counterpart of `bin/lint.ts`.
 *
 * `blong-dev test` is what most packages call and it does exactly this, but it
 * cannot be used here: `blong-dev` depends on this package, so calling it back
 * would close a workspace cycle.
 *
 * Two details are copied from it deliberately:
 *
 * - the coverage output is cleared first, so tap's V8 JSONs never accumulate;
 * - the globs are explicit rather than left to tap's discovery, because tap's
 *   default `include` also matches non-test files that merely live under a
 *   `test/` folder (Playwright specs, layer files), which are not tap tests.
 *
 * The target is the package this file lives in, not the working directory, so it
 * behaves the same however it is invoked.
 *
 * Usage:
 *   node ./bin/test.ts              # the package suite
 *   node ./bin/test.ts --jobs=1     # extra arguments are passed to tap
 */
import {spawn} from 'node:child_process';
import {rmSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tap = fileURLToPath(new URL('../node_modules/.bin/tap', import.meta.url));
// npm and pnpm install a `.cmd` shim on Windows; the bare name is not runnable.
const executable = process.platform === 'win32' ? `${tap}.cmd` : tap;

// Fresh coverage output each run so tap V8 JSONs never accumulate.
rmSync(join(root, '.tap', 'coverage'), {recursive: true, force: true});

const child = spawn(
    executable,
    [
        '*.test.ts',
        '**/*.test.ts',
        '--allow-incomplete-coverage',
        '--coverage-report=none',
        ...process.argv.slice(2),
    ],
    {cwd: root, stdio: 'inherit'},
);

child.on('error', error => {
    console.error(`blong-lint: could not run tap: ${error.message}`);
    process.exitCode = 1;
});
child.on('close', code => {
    process.exitCode = code ?? 1;
});
