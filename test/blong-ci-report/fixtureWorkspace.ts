/**
 * Builds a throw-away monorepo that looks enough like blong for the CI report
 * pipeline to run against it: a `rush.json`, one `.ci-report/` per package, a
 * Playwright package with real Allure results and a trace, and an lcov report.
 *
 * Used by `npm run report:local` (writes into the gitignored `dev/`) and by the
 * unit tests (writes into a temp directory).
 */

import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

import type {IReport, ITestEntry, TestStatus} from '@feasibleone/blong-dev';

interface IFixturePackage {
    folder: string;
    runner: string;
    tests: Array<{name: string; status: TestStatus}>;
}

const FIXTURE_PACKAGES: IFixturePackage[] = [
    {
        folder: 'core/fake-pass',
        runner: 'tap',
        tests: Array.from({length: 12}, (_, index) => ({
            name: `passes case ${index + 1}`,
            status: 'passed' as const,
        })),
    },
    {
        folder: 'realm/fake-fail',
        runner: 'playwright',
        tests: [
            ...Array.from({length: 8}, (_, index) => ({
                name: `renders screen ${index + 1}`,
                status: 'passed' as const,
            })),
            {name: 'logs in as the seeded user', status: 'failed' as const},
            {name: 'opens the report tab', status: 'failed' as const},
        ],
    },
    {
        folder: 'tools/fake-flaky',
        runner: 'tap',
        tests: [
            {name: 'handles a cold cache', status: 'passed' as const},
            {name: 'handles a warm cache', status: 'passed' as const},
            {name: 'retries a transient failure', status: 'flaky' as const},
        ],
    },
    // No `.ci-report/` on purpose: exercises the "produced no report" branch.
    {folder: 'demo/fake-empty', runner: 'tap', tests: []},
];

/** Playwright attachment uuid used by the failing fixture result. */
const TRACE_FILE = 'aaaa1111-2222-3333-4444-555555555555-attachment.zip';

function buildReport(pkg: IFixturePackage): IReport {
    const tests: ITestEntry[] = pkg.tests.map(test => ({
        ...test,
        ...(test.status === 'failed'
            ? {
                  file: `${pkg.folder}/test/${test.name.replace(/\s+/g, '-')}.play.ts`,
                  line: 42,
                  message: `expected 200 but received 500 for "${test.name}"`,
                  stack: `at ${pkg.folder} (test.ts:42:7)`,
                  ...(pkg.runner === 'playwright' ? {trace: TRACE_FILE} : {}),
              }
            : {}),
    }));
    const counts = {total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0, todo: 0};
    for (const test of tests) {
        counts.total += 1;
        if (test.status === 'passed') counts.passed += 1;
        else if (test.status === 'failed') counts.failed += 1;
        else if (test.status === 'flaky') counts.flaky += 1;
    }
    const name = pkg.folder.split('/')[1]!;
    return {
        schema: 1,
        package: name,
        path: pkg.folder,
        runner: pkg.runner,
        status: counts.failed > 0 ? 'failed' : counts.flaky > 0 ? 'flaky' : 'passed',
        counts,
        generatedAt: '2026-01-01T00:00:00.000Z',
        suites:
            pkg.tests.length > 0
                ? [
                      {
                          name: `${name}.test`,
                          file: `${pkg.folder}/test.ts`,
                          status:
                              counts.failed > 0 ? 'failed' : counts.flaky > 0 ? 'flaky' : 'passed',
                          counts,
                          tests,
                      },
                  ]
                : [],
    };
}

/** Minimal Allure result file; `status` decides whether it is staged as a failure. */
function allureResult(uuid: string, name: string, status: string, withTrace: boolean): object {
    return {
        uuid,
        historyId: `history-${uuid}`,
        testCaseId: `case-${uuid}`,
        name,
        fullName: `blong-access > login > ${name}`,
        status,
        statusDetails:
            status === 'failed'
                ? {
                      message: `expected 200 but received 500 for "${name}"`,
                      trace: 'at login (login.play.ts:42:7)',
                  }
                : {},
        stage: 'finished',
        start: 1,
        stop: 2,
        labels: [
            {name: 'suite', value: 'blong-access'},
            {name: 'subSuite', value: 'login'},
        ],
        attachments: withTrace
            ? [{name: 'trace', source: TRACE_FILE, type: 'application/vnd.allure.playwright-trace'}]
            : [],
        steps: [],
    };
}

export interface IFixtureWorkspace {
    root: string;
    /** Packages that produced a report (the empty fixture package is excluded). */
    packages: string[];
}

/** Create the fixture monorepo at `root` (overwritten when it exists). */
export function createFixtureWorkspace(root: string): IFixtureWorkspace {
    mkdirSync(root, {recursive: true});
    writeFileSync(
        join(root, 'rush.json'),
        JSON.stringify(
            {
                rushVersion: '5.164.0',
                pnpmVersion: '10.33.2',
                projects: FIXTURE_PACKAGES.map(pkg => ({
                    packageName: `@fixture/${pkg.folder.split('/')[1]}`,
                    projectFolder: pkg.folder,
                })),
            },
            null,
            2,
        ),
    );

    for (const pkg of FIXTURE_PACKAGES) {
        if (pkg.tests.length === 0) continue;
        const dir = join(root, pkg.folder, '.ci-report');
        mkdirSync(dir, {recursive: true});
        writeFileSync(join(dir, 'report.json'), JSON.stringify(buildReport(pkg), null, 2));
    }

    // Playwright package: real Allure results (two failures + one pass) and the
    // trace that the runner moved next to the report.
    const failDir = join(root, 'realm/fake-fail');
    const resultsDir = join(failDir, 'allure-results');
    mkdirSync(resultsDir, {recursive: true});
    writeFileSync(
        join(resultsDir, 'container.json'),
        JSON.stringify({uuid: 'container-1', name: 'login fixtures', children: []}),
    );
    writeFileSync(
        join(resultsDir, 'fail-1-result.json'),
        JSON.stringify(allureResult('fail-1', 'logs in as the seeded user', 'failed', true)),
    );
    writeFileSync(
        join(resultsDir, 'fail-2-result.json'),
        JSON.stringify(allureResult('fail-2', 'opens the report tab', 'failed', false)),
    );
    writeFileSync(
        join(resultsDir, 'pass-1-result.json'),
        JSON.stringify(allureResult('pass-1', 'renders the login form', 'passed', false)),
    );
    const tracesDir = join(failDir, '.ci-report/publish/traces');
    mkdirSync(tracesDir, {recursive: true});
    writeFileSync(join(tracesDir, TRACE_FILE), 'not-a-real-trace');
    writeFileSync(
        join(failDir, '.ci-report/history.jsonl'),
        [
            JSON.stringify({name: 'logs in as the seeded user', status: 'failed'}),
            JSON.stringify({name: 'opens the report tab', status: 'passed'}),
        ].join('\n') + '\n',
    );

    // Aggregated coverage, as `rush ci-coverage` would leave it at the repo root.
    // `fake-silent` has coverage but no report of its own, which is what a package
    // whose runner does not write the `.ci-report/` contract looks like.
    const coverageDir = join(root, 'coverage');
    mkdirSync(coverageDir, {recursive: true});
    writeFileSync(
        join(coverageDir, 'lcov.info'),
        [
            'SF:core/fake-pass/src/index.ts',
            'LF:100',
            'LH:80',
            'SF:realm/fake-fail/src/login.ts',
            'LF:200',
            'LH:50',
            'SF:tools/fake-silent/src/quiet.ts',
            'LF:50',
            'LH:25',
            '',
        ].join('\n'),
    );

    return {
        root,
        packages: FIXTURE_PACKAGES.filter(pkg => pkg.tests.length > 0).map(
            pkg => pkg.folder.split('/')[1]!,
        ),
    };
}
