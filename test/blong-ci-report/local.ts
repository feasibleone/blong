/**
 * Local end-to-end run of the CI report pipeline.
 *
 *   npm run report:local            # build the fixture workspace and aggregate it
 *   npm run report:local -- --keep  # keep the previous fixture output
 *
 * Creates a fake monorepo under `dev/ci-report-fixture/` (gitignored) and runs
 * the real `blong-dev ci-report` against it, so the aggregated report, the
 * failures bundle and the rebuilt metrics/history files can be inspected before
 * pushing a workflow change. The published-report links are rendered against
 * `CI_REPORTS_BASE` (an example URL by default) so the local report matches the
 * one CI produces.
 *
 * A genuinely failing run of this package's own tap suite is the other half of
 * the harness:
 *
 *   CI_REPORT_FORCE_FAIL=1 npm run ci-test && npm run ci-report
 */

import {spawnSync} from 'node:child_process';
import {existsSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

import {repoRoot} from '@feasibleone/blong-dev';

import {createFixtureWorkspace} from './fixtureWorkspace.ts';

const root = repoRoot(process.cwd());
const fixtureRoot = join(root, 'dev', 'ci-report-fixture');
const outDir = join(fixtureRoot, 'out');
const blongDevBin = join(root, 'tools', 'blong-dev', 'bin', 'blong-dev.ts');

if (process.argv.includes('--clean')) rmSync(outDir, {recursive: true, force: true});

const {packages} = createFixtureWorkspace(fixtureRoot);

// A baseline, so the report renders its delta columns exactly like a PR run.
const baseline = join(fixtureRoot, 'baseline.json');
writeFileSync(
    baseline,
    JSON.stringify(
        {
            schema: 1,
            commit: '',
            run: 1,
            updatedAt: '2026-01-01T00:00:00.000Z',
            tests: {total: 20, passed: 20, failed: 0, flaky: 0},
            coverage: {lines: {hit: 100, found: 300}},
            packages: {
                'fake-pass': {
                    tests: {passed: 10, failed: 0, flaky: 0, total: 10},
                    coverage: {linesHit: 70, linesTotal: 100},
                },
            },
        },
        null,
        2,
    ),
);

console.log(`fixture workspace: ${fixtureRoot} (${packages.length} package(s) with a report)`);

const result = spawnSync(
    process.execPath,
    [blongDevBin, 'ci-report', '--out', outDir, '--baseline', baseline],
    {
        cwd: join(fixtureRoot, 'realm', 'fake-fail'),
        stdio: 'inherit',
        env: {
            ...process.env,
            // The workflow resolves these before rendering; standing in for them
            // here keeps the local report identical to the CI one, links included.
            CI_REPORTS_BASE: process.env['CI_REPORTS_BASE'] ?? 'https://example.test/blong-ci',
            GITHUB_WORKFLOW: process.env['GITHUB_WORKFLOW'] ?? 'Build',
            GITHUB_RUN_NUMBER: process.env['GITHUB_RUN_NUMBER'] ?? '551',
        },
    },
);
if (result.status !== 0) process.exit(result.status ?? 1);

const publish = join(outDir, 'ci-failures', 'publish');
console.log('');
console.log('What CI would use from here:');
console.log(`  action summary / PR comment : ${join(outDir, 'ci-report.md')}`);
console.log(`  aggregate data              : ${join(outDir, 'report-data', 'ci-summary.json')}`);
console.log(`  metrics snapshot            : ${join(outDir, 'metrics.json')}`);
console.log(
    `  rebuilt baseline + history  : ${join(outDir, '.github', 'metrics.json')}, ${join(outDir, '.github', 'history.jsonl')}`,
);
if (existsSync(publish)) {
    console.log(`  published failures bundle   : ${publish}`);
    console.log(`    ↳ agent entry point       : ${join(publish, 'failures.json')}`);
    console.log(`    ↳ Allure report           : ${join(publish, 'index.html')}`);
}
console.log('');
console.log(`Preview with:  npx --yes serve ${outDir}`);
