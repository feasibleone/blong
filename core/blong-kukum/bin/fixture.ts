import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {readdir} from 'node:fs/promises';
import {basename, dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

import type {PrimitiveHost} from '../engine.ts';
import {FIXTURE, regenerateFixture} from '../fixture.ts';

/**
 * Regenerate the committed end-to-end fixture and refresh its Playwright
 * baselines.
 *
 * Generation and baseline refresh are deliberately kept out of `e2e.test.ts`:
 * the test only ever *compares*, so an intentional UI change fails until someone
 * runs this and reviews the resulting PNG diffs. A test that updated its own
 * baselines would assert nothing.
 *
 *     node --run kukum:fixture:update
 */

const host: PrimitiveHost = {
    existsSync,
    readFileSync,
    writeFileSync,
    mkdirSync: path => mkdirSync(path, {recursive: true}),
    scan: async (...path: string[]) => readdir(join(...path), {withFileTypes: true}),
    statSync,
    join,
    dirname,
    basename,
    relative,
    resolve,
};

const PATH_SEP = process.platform === 'win32' ? ';' : ':';
const blongDevBin = fileURLToPath(new URL('../node_modules/.bin/blong-dev', import.meta.url));

/**
 * Vite is needed by the fixture's Playwright config (it serves the browser
 * side), and the fixture has no `node_modules` of its own, so blong-browser's
 * bin directory is borrowed for the run.
 */
const TOOL_BINS = [
    fileURLToPath(new URL('../node_modules/.bin', import.meta.url)),
    fileURLToPath(new URL('../../blong-browser/node_modules/.bin', import.meta.url)),
];

export async function updateFixture(updateBaselines: boolean): Promise<number> {
    // A baseline refresh means the old PNGs are exactly what must go, so they
    // are not carried across; otherwise the committed baselines are preserved,
    // since regenerating deletes the tree they live in.
    const results = await regenerateFixture(host, {keepBaselines: !updateBaselines});
    const written = results.reduce((total, result) => total + result.written.length, 0);
    console.log(`fixture regenerated: ${written} file(s) written to ${FIXTURE}`);

    const notices = results.flatMap(result => result.messages ?? []);
    for (const notice of notices) console.log(`note: ${notice}`);
    if (notices.some(notice => /could not/.test(notice))) {
        console.error('a generated test group was not registered — fix that first');
        return 1;
    }
    if (!updateBaselines) return 0;

    const args = ['playwright', '--update-snapshots'];
    const run = spawnSync(blongDevBin, args, {
        cwd: FIXTURE,
        stdio: 'inherit',
        env: {
            ...process.env,
            PLAYWRIGHT_BACKEND_PORT: '8191',
            PLAYWRIGHT_FRONTEND_PORT: '5291',
            PATH: [...TOOL_BINS, process.env['PATH'] ?? ''].join(PATH_SEP),
        },
    });
    return run.status ?? 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    process.exitCode = await updateFixture(process.argv.includes('--baselines'));
}
