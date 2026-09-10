#!/usr/bin/env -S node
/**
 * Lint this package with its own linter.
 *
 * `blong-dev lint` is the same presentation, and `blong-dev` is what most
 * packages call — but `blong-dev` depends on this package, so calling it back
 * would close a workspace cycle. Nothing is lost by not doing so: the tools are
 * pinned here, and {@link lintCollect} resolves them from this package's own
 * `node_modules/.bin` first.
 *
 * The target is the package this file lives in, not the working directory, so it
 * behaves the same however it is invoked.
 *
 * Usage:
 *   node ./bin/lint.ts              # the whole package
 *   node ./bin/lint.ts src/a.ts     # staged: cspell/eslint scoped, tsc whole
 */
import {fileURLToPath} from 'node:url';

import {lintCli} from '../cli.ts';

await lintCli(process.argv.slice(2), {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
});
