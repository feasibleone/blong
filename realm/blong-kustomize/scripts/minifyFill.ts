/**
 * minifyFill.ts — write the module a fill Job runs, minified by swc.
 *
 * The copy that runs in a Job is a derived artefact, written once here rather than at generation time:
 * the framework image and the operator's artifact carry no minifier, and a mount that can resolve no
 * dependency above it is exactly why `fill.ts` is embedded rather than imported (@@D-518). What is
 * committed is this script's output, and `testFill` re-runs it and compares, so editing the source
 * without running `npm run sync-fill-module` fails in the suite rather than in a cluster (@@D-542).
 *
 * Run it through the package script, or directly: `node scripts/minifyFill.ts`.
 */

import {transformSync} from '@swc/core';
import {readFileSync, writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

/** The module, minified: comments and whitespace gone, names kept for a readable stack trace. */
export const minifiedFill = (source: string): string =>
    transformSync(source, {
        filename: 'fill.ts',
        minify: true,
        isModule: true,
        module: {type: 'es6'},
        jsc: {
            parser: {syntax: 'typescript'},
            target: 'es2022',
            // Names are kept on purpose: an error inside a mounted copy is read from a Job's log,
            // where `d` and `e` say nothing, and the few characters they save are not the problem.
            keepClassNames: true,
            minify: {compress: true, mangle: false, format: {comments: false}},
        },
    }).code;

/** The source beside this folder, and the file the ConfigMap's bytes come from. */
export const FILL_SOURCE = new URL('../fill.ts', import.meta.url);
export const FILL_MINIFIED = new URL('../fill.min.mts', import.meta.url);

// Only when run, not when imported: a test that re-runs the minifier must not rewrite the file it is
// comparing against.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const source = readFileSync(FILL_SOURCE, 'utf8');
    const minified = minifiedFill(source);
    writeFileSync(FILL_MINIFIED, minified);
    process.stdout.write(
        `# wrote fill.min.mts — ${minified.length} bytes in ${minified.split('\n').length} line(s), ` +
            `from ${source.split('\n').length} lines of source\n`,
    );
}
