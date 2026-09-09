/**
 * Smoke test for the unified coverage pipeline (core/blong-gogo/run-coverage.sh
 * -> mergeCoverage.mjs).
 *
 * Verifies that two istanbul coverage maps (a server map from `c8 --reporter
 * json` and a browser map from vitest `coverage-final.json`) merge into a
 * single `lcov.info` + `lcov-report/` HTML report with repo-relative paths.
 * This guards against regressions like the c8-vitest incompatibility that
 * silently produced 0% browser coverage.
 */

import {spawnSync} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

import {test} from 'tap';

const scriptFile = fileURLToPath(new URL('../mergeCoverage.mjs', import.meta.url));
const repoRoot = join(dirname(dirname(fileURLToPath(import.meta.url))), '..', '..');
const c8BinDir = join(repoRoot, 'common', 'temp', 'node_modules', '.pnpm', 'node_modules', '.bin');

/** Minimal istanbul file-coverage fixture for one source file. */
function fileCoverage(relPath: string, hits: number): object {
    return {
        path: relPath,
        statementMap: {
            0: {start: {line: 1, column: 0}, end: {line: 5, column: 0}},
        },
        fnMap: {},
        branchMap: {},
        s: {0: hits},
        f: {},
        b: {},
    };
}

test('mergeCoverage — merges server + browser istanbul maps into lcov + HTML', async t => {
    if (!existsSync(scriptFile) || !existsSync(c8BinDir)) {
        t.comment('mergeCoverage.mjs or pnpm store not found — skipping');
        t.end();
        return;
    }

    const dir = mkdtempSync(join(tmpdir(), 'blong-merge-cov-'));
    try {
        const serverMap = join(dir, 'server.json');
        const browserMap = join(dir, 'browser.json');
        const outDir = join(dir, 'out');
        writeFileSync(
            serverMap,
            JSON.stringify({
                'core/blong-gogo/src/server.ts': fileCoverage('core/blong-gogo/src/server.ts', 3),
            }),
        );
        writeFileSync(
            browserMap,
            JSON.stringify({
                'core/blong-browser/src/Button.tsx': fileCoverage(
                    'core/blong-browser/src/Button.tsx',
                    2,
                ),
            }),
        );

        const result = spawnSync(process.execPath, [scriptFile, outDir, serverMap, browserMap], {
            env: {...process.env, C8_BIN_DIR: c8BinDir, REPO_DIR: repoRoot},
            encoding: 'utf8',
        });

        t.equal(result.status, 0, `mergeCoverage exits 0\n${result.stderr}`);
        const lcov = readFileSync(join(outDir, 'lcov.info'), 'utf8');
        t.match(lcov, /SF:core\/blong-gogo\/src\/server\.ts/, 'server source in lcov');
        t.match(lcov, /SF:core\/blong-browser\/src\/Button\.tsx/, 'browser source in lcov');
        t.match(
            lcov,
            /SF:core\/blong-gogo\/src\/server\.ts[\s\S]{0,400}?LH:[1-9]/,
            'server hits merged (positive)',
        );
        t.equal(
            existsSync(join(outDir, 'lcov-report', 'index.html')),
            true,
            'HTML report generated',
        );
        t.end();
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});
