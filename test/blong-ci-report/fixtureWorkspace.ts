/**
 * Builds a throw-away monorepo that looks enough like blong for the CI report
 * pipeline to run against it: a `rush.json`, one `.ci-report/` per package, a
 * Playwright package with real Allure results and a trace, an lcov report, and the
 * base branch's Allure history — so every line of the report has something real to
 * render, including the ones that only appear when there is something to say.
 *
 * Used by `npm run report:local` (writes into the gitignored `dev/`) and by the
 * unit tests (writes into a temp directory).
 */

import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

import {reportOf, type IRunReport, type ITestEntry, type TestStatus} from '@feasibleone/blong-dev';

interface IFixtureTest {
    name: string;
    status: TestStatus;
    /** Allure's own name for the test, when the fixture wants an exact history match. */
    fullName?: string;
    /** Wall clock of the test, when the fixture wants it in the slowest-tests table. */
    durationMs?: number;
}

interface IFixtureRun {
    runner: string;
    tests: IFixtureTest[];
    /** Wall clock of the leg; defaults to the sum of its tests. */
    durationMs?: number;
}

interface IFixturePackage {
    folder: string;
    /** One entry per runner the package runs, oldest first. */
    runs: IFixtureRun[];
}

const FIXTURE_PACKAGES: IFixturePackage[] = [
    {
        folder: 'core/fake-pass',
        runs: [
            {
                runner: 'tap',
                durationMs: 4200,
                tests: Array.from({length: 12}, (_, index) => ({
                    name: `passes case ${index + 1}`,
                    status: 'passed' as const,
                    durationMs: 120 + index * 7,
                })),
            },
        ],
    },
    {
        folder: 'realm/fake-fail',
        runs: [
            {
                runner: 'playwright',
                durationMs: 65_000,
                tests: [
                    ...Array.from({length: 8}, (_, index) => ({
                        name: `renders screen ${index + 1}`,
                        status: 'passed' as const,
                        durationMs: 900 + index * 11,
                    })),
                    {
                        name: 'logs in as the seeded user',
                        status: 'failed' as const,
                        durationMs: 10_659,
                        fullName: fullNameOf('logs in as the seeded user'),
                    },
                    {
                        name: 'opens the report tab',
                        status: 'failed' as const,
                        durationMs: 2040,
                        fullName: fullNameOf('opens the report tab'),
                    },
                ],
            },
        ],
    },
    {
        folder: 'tools/fake-flaky',
        runs: [
            {
                runner: 'tap',
                durationMs: 12_000,
                tests: [
                    {name: 'handles a cold cache', status: 'passed' as const, durationMs: 5124},
                    {name: 'handles a warm cache', status: 'passed' as const, durationMs: 88},
                    {
                        name: 'retries a transient failure',
                        status: 'flaky' as const,
                        durationMs: 3010,
                    },
                    // A test that did not run: the report has to say so, because no other
                    // count in it can reveal a suite that quietly stopped running.
                    {name: 'needs a browser', status: 'skipped' as const},
                ],
            },
        ],
    },
    // A package that runs both runners in a cycle: its handler tests under tap and
    // its browser tests under Playwright. This is the case the report has to describe
    // as one package — the counts are the sum, the failing test says which runner it
    // came from — rather than as whichever runner wrote last (T-150).
    {
        folder: 'realm/fake-both',
        runs: [
            {
                runner: 'tap',
                durationMs: 9000,
                tests: [
                    {name: 'loads the realm', status: 'passed' as const, durationMs: 1.4},
                    {name: 'serves a handler', status: 'passed' as const, durationMs: 240},
                    {name: 'reports a missing handler', status: 'passed' as const, durationMs: 61},
                    {name: 'writes an audit entry', status: 'todo' as const},
                ],
            },
            {
                runner: 'playwright',
                durationMs: 45_000,
                tests: [
                    {name: 'opens the access page', status: 'passed' as const, durationMs: 8100},
                    {name: 'opens the roles tab', status: 'failed' as const, durationMs: 8200},
                ],
            },
        ],
    },
    // No `.ci-report/` on purpose: exercises the "produced no report" branch.
    {folder: 'demo/fake-empty', runs: []},
];

/**
 * The base branch's Allure history, as `blong-dev ci-report` reads it.
 *
 * Two runs of every package that reports to Allure, chosen so each provenance word
 * appears: `logs in as the seeded user` is red in both runs (recurring), the two tab
 * tests are green (new), and the flaky one failed once and passed since
 * (intermittent). A test the history never saw stays unknown.
 */
const FIXTURE_HISTORY: Array<{pkg: string; run: number; tests: IFixtureTest[]}> = [
    {
        pkg: 'fake-fail',
        run: 1,
        tests: [
            {
                name: 'logs in as the seeded user',
                status: 'failed',
                fullName: fullNameOf('logs in as the seeded user'),
            },
            {
                name: 'opens the report tab',
                status: 'passed',
                fullName: fullNameOf('opens the report tab'),
            },
        ],
    },
    {
        pkg: 'fake-fail',
        run: 2,
        tests: [
            {
                name: 'logs in as the seeded user',
                status: 'failed',
                fullName: fullNameOf('logs in as the seeded user'),
            },
            {
                name: 'opens the report tab',
                status: 'passed',
                fullName: fullNameOf('opens the report tab'),
            },
        ],
    },
    {
        pkg: 'fake-flaky',
        run: 1,
        tests: [{name: 'retries a transient failure', status: 'failed'}],
    },
    {
        pkg: 'fake-flaky',
        run: 2,
        tests: [{name: 'retries a transient failure', status: 'passed'}],
    },
    {
        pkg: 'fake-both',
        run: 1,
        tests: [{name: 'opens the roles tab', status: 'passed'}],
    },
];

/** Playwright attachment uuid used by the failing fixture result. */
const TRACE_FILE = 'aaaa1111-2222-3333-4444-555555555555-attachment.zip';

/**
 * Allure's full name for a browser test of the fixture, written the way Playwright
 * itself writes it (`spec file › group › title`). The history is keyed on this, and the
 * report carries it on every test whose runner recorded one, so the two join exactly.
 */
function fullNameOf(name: string): string {
    return `login.play.ts › blong-access › ${name}`;
}

function buildRun(pkg: IFixturePackage, run: IFixtureRun): IRunReport {
    const tests: ITestEntry[] = run.tests.map(test => ({
        ...test,
        ...(test.fullName ? {fullName: test.fullName} : {}),
        ...(test.status === 'failed'
            ? {
                  file: `${pkg.folder}/test/${test.name.replace(/\s+/g, '-')}.play.ts`,
                  line: 42,
                  message: `expected 200 but received 500 for "${test.name}"`,
                  stack: `at ${pkg.folder} (test.ts:42:7)`,
                  ...(run.runner === 'playwright' ? {trace: TRACE_FILE} : {}),
              }
            : {}),
    }));
    const counts = {total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0, todo: 0};
    let measured = 0;
    for (const test of tests) {
        counts.total += 1;
        if (test.status === 'passed') counts.passed += 1;
        else if (test.status === 'failed') counts.failed += 1;
        else if (test.status === 'flaky') counts.flaky += 1;
        else if (test.status === 'skipped') counts.skipped += 1;
        else if (test.status === 'todo') counts.todo += 1;
        measured += test.durationMs ?? 0;
    }
    const name = pkg.folder.split('/')[1]!;
    return {
        runner: run.runner,
        status: counts.failed > 0 ? 'failed' : counts.flaky > 0 ? 'flaky' : 'passed',
        counts,
        durationMs: run.durationMs ?? measured,
        generatedAt: '2026-01-01T00:00:00.000Z',
        suites:
            run.tests.length > 0
                ? [
                      {
                          name: `${name}.${run.runner}.test`,
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
        fullName: fullNameOf(name),
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
        if (pkg.runs.length === 0) continue;
        const dir = join(root, pkg.folder, '.ci-report');
        mkdirSync(dir, {recursive: true});
        const runs = pkg.runs.map(run => buildRun(pkg, run));
        const report = reportOf({package: pkg.folder.split('/')[1]!, path: pkg.folder}, runs);
        writeFileSync(join(dir, 'report.json'), JSON.stringify(report, null, 2));
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

    // The base branch's Allure history, at the repository root: `ci-report` reads it
    // to tell a failure this branch introduced from one main is already red on. The
    // packages' own `history.jsonl` slices are a different thing — they are what the
    // runners feed Allure, and the rebuild at the end of `ci-report` merges them.
    const githubDir = join(root, '.github');
    mkdirSync(githubDir, {recursive: true});
    writeFileSync(
        join(githubDir, 'history.jsonl'),
        FIXTURE_HISTORY.flatMap(entry =>
            entry.tests.map((test, index) => {
                const id = `history-${entry.pkg}-${test.name}`;
                return JSON.stringify({
                    package: entry.pkg,
                    uuid: `${entry.pkg}-run-${entry.run}`,
                    name: `run ${entry.run}`,
                    timestamp: 1789506094910 + entry.run * 1000 + index,
                    testResults: {
                        [id]: {
                            id,
                            name: test.name,
                            fullName:
                                test.fullName ?? `index.test.ts › ${entry.pkg} › ${test.name}`,
                            status: test.status,
                            duration: test.durationMs ?? 1000,
                        },
                    },
                });
            }),
        ).join('\n') + '\n',
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
        packages: FIXTURE_PACKAGES.filter(pkg => pkg.runs.length > 0).map(
            pkg => pkg.folder.split('/')[1]!,
        ),
    };
}
