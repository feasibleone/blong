/**
 * Tests for assembling the diagnosis.
 *
 * The fixture is build #622 in miniature: a bundle that names two failing packages, an operation
 * summary that names three, an artifact that explains the third, and a site that remembers the
 * previous run of each package. What is pinned is what the assembly adds — the leg the bundle never
 * heard about, the reason the artifact supplied, the comparison, and a note for every gap it could
 * not close (@@F-539, @@D-561).
 */
import {test} from 'tap';

import type {IFailuresJson} from '../report/failuresBundle.ts';
import type {IReport} from '../report/reportTypes.ts';
import {diagnose} from './diagnose.ts';
import type {IArtifactEvidence} from './evidence.ts';
import type {IOperationResult} from './operations.ts';
import type {ICiTarget, IRunComparison} from './types.ts';

const TARGET: ICiTarget = {
    repository: 'feasibleone/blong',
    workflow: 'Build',
    run: 622,
    runId: 38791173525,
    commit: '776c9c60deadbeef',
    branch: 'release-please--branches--main',
    runUrl: 'https://github.com/feasibleone/blong/actions/runs/38791173525',
    how: 'the release-please pull request #200, newest completed run',
};

/** The bundle of #622: two packages, neither of them `blong-log`. */
function bundleOf(): IFailuresJson {
    return {
        schema: 1,
        generatedAt: '2026-10-15T19:33:55.185Z',
        repository: 'feasibleone/blong',
        workflow: 'Build',
        run: 622,
        commit: TARGET.commit,
        runUrl: TARGET.runUrl,
        totals: {packages: 2, tests: 2, failed: 2, flaky: 0, newFailures: 0},
        allure: 'index.html',
        packages: [
            {
                package: 'blong-cli',
                path: 'demo/blong-cli',
                runners: ['tap'],
                counts: {total: 12, passed: 11, failed: 1, flaky: 0, skipped: 0, todo: 0},
                failures: [
                    {
                        suite: '(unparsed)',
                        test: 'tap exited with code 1 without reporting a failing test',
                        status: 'failed',
                        runner: 'tap',
                    },
                ],
            },
            {
                package: 'blong-kukum',
                path: 'core/blong-kukum',
                runners: ['tap'],
                counts: {total: 559, passed: 558, failed: 1, flaky: 0, skipped: 0, todo: 0},
                failures: [
                    {
                        suite: 'index.test.ts',
                        test: 'kukum meta endpoints over the gateway › timeout!',
                        status: 'failed',
                        runner: 'tap',
                        file: 'index.test.ts',
                        line: 27,
                    },
                ],
            },
        ],
    };
}

/** The operation summary of #622: three failures, the third with no report of its own. */
const OPERATIONS: IOperationResult[] = [
    {
        package: 'blong-cli',
        scoped: '@feasibleone/blong-cli',
        verdict: 'failure',
        durationText: '1 minute 10.6 seconds',
        commands: ['blong-dev test'],
        detail: ['✖ tap exited with code 1', '# blong-cli: 11 passed, 1 failed (12 total)'],
    },
    {
        package: 'blong-log',
        scoped: '@feasibleone/blong-log',
        verdict: 'failure',
        durationText: '1 minute 56.8 seconds',
        commands: ['rc=0; blong-dev test || rc=$?'],
        detail: ['# blong-log: 82 passed, 0 failed (82 total)'],
    },
    {
        package: 'blong-kukum',
        scoped: '@feasibleone/blong-kukum',
        verdict: 'failure',
        durationText: '5 minutes 43.8 seconds',
        commands: ['blong-dev test --jobs=1'],
        detail: ['✖ kukum meta endpoints over the gateway › timeout!'],
    },
];

/** An artifact that knows the Storybook leg of `blong-log` and the raw stream of the two tap runs. */
function evidenceOf(): IArtifactEvidence {
    return {
        locate: packageName => (packageName === 'blong-log' ? 'tools/blong-log' : undefined),
        logFailures: path =>
            path === 'tools/blong-log'
                ? [
                      {
                          runner: 'storybook',
                          test: 'LogViewer › FilteredServer › smoke-test',
                          excerpt:
                              '  ● LogViewer › FilteredServer › smoke-test\n\n    was 0.52% different',
                      },
                  ]
                : [],
        excerpt: failure =>
            failure.runner === 'tap'
                ? `not ok 1 - timeout!\n  ---\n  expired: ${failure.path === 'demo/blong-cli' ? 'index.test.ts' : 'TAP'}`
                : undefined,
        message: () => undefined,
        report: () => undefined,
        stderr: () => undefined,
    };
}

/** A site that remembers one earlier run per package. */
function previousOf(): (pkg: string, run: number) => Promise<IRunComparison | undefined> {
    return async (pkg, run) => {
        if (run !== 621) return undefined;
        const counts =
            pkg === 'blong-cli'
                ? {total: 14, passed: 14, failed: 0, flaky: 0, skipped: 0, todo: 0}
                : {total: 563, passed: 563, failed: 0, flaky: 0, skipped: 0, todo: 0};
        return {
            run,
            status: 'passed',
            counts,
            testsMs: pkg === 'blong-cli' ? 27_000 : 3000,
            source: 'page',
        };
    };
}

test('the diagnosis finds the failing operation the bundle never heard about', async t => {
    const diagnosis = await diagnose({
        target: TARGET,
        bundle: bundleOf(),
        operations: OPERATIONS,
        history: [622, 621],
    });

    t.equal(diagnosis.red, true, 'the run is red');
    t.equal(diagnosis.totals.tests, 2, 'the bundle names two failing tests');
    t.equal(diagnosis.packages.length, 3, 'and the run had three failing packages');
    const log = diagnosis.packages.find(pkg => pkg.package === 'blong-log');
    t.equal(log?.legGap, true, 'the third is the leg gap');
    t.match(log?.verdict?.reason, /bundle has nothing for it/, 'with the verdict that explains it');
    t.equal(log?.operation?.durationText, '1 minute 56.8 seconds', 'and its own operation');
    const kukum = diagnosis.packages.find(pkg => pkg.package === 'blong-kukum');
    t.equal(kukum?.failures[0]?.line, 27, 'a failure keeps the location the bundle gave');
    t.end();
});

test('with the artifact, every failure gets a reason and a verdict', async t => {
    const diagnosis = await diagnose({
        target: TARGET,
        bundle: bundleOf(),
        operations: OPERATIONS,
        history: [622, 621],
        previous: previousOf(),
        evidence: evidenceOf(),
        artifactDir: 'dev/ci/622',
    });

    t.equal(diagnosis.evidence, 'artifact', 'the answer says where its reasons came from');
    const cli = diagnosis.packages.find(pkg => pkg.package === 'blong-cli');
    t.match(cli?.failures[0]?.evidence, /expired: index\.test\.ts/, 'the raw stream is quoted');
    t.equal(cli?.failures[0]?.source, 'artifact', 'and credited to the artifact');
    t.equal(
        cli?.failures[0]?.verdict?.kind,
        'timeout-under-load',
        'the stream decides the verdict',
    );
    t.match(
        cli?.previous && `#${cli.previous.run} ${cli.previous.status}`,
        /#621 passed/,
        'the comparison',
    );

    const log = diagnosis.packages.find(pkg => pkg.package === 'blong-log');
    t.equal(log?.path, 'tools/blong-log', 'a package the bundle lacks is located in the artifact');
    t.equal(log?.failures.length, 1, 'and its failing leg is listed from its own log');
    t.match(log?.failures[0]?.test, /FilteredServer › smoke-test/, 'with the test jest named');
    t.match(
        diagnosis.notes.join('\n'),
        /the bundle names 2 failing test\(s\) while the evidence accounts for 3/,
        'and the difference is stated',
    );
    t.end();
});

test('a failure nothing explains is left without a verdict, and says so', async t => {
    const diagnosis = await diagnose({
        target: TARGET,
        bundle: bundleOf(),
        operations: OPERATIONS,
        history: [622],
    });

    const cli = diagnosis.packages.find(pkg => pkg.package === 'blong-cli');
    t.equal(cli?.failures[0]?.verdict, undefined, 'no cause is invented');
    t.match(
        diagnosis.notes.join('\n'),
        /2 failure\(s\) came with no reason: run with --full/,
        'and the reader is told what would answer it',
    );
    t.end();
});

test('a bundle of flaky entries does not make a green run red', async t => {
    // #621 is the case: `Build` succeeded, and its bundle holds one flaky test whose retry passed.
    // Reading the bundle's existence as "red" sent a reader looking for a failure that is not
    // there (@@F-544).
    const flaky: IFailuresJson = {
        ...bundleOf(),
        run: 621,
        totals: {packages: 1, tests: 1, failed: 0, flaky: 1, newFailures: 1},
        packages: [
            {
                package: 'blong-party',
                path: 'realm/blong-party',
                runners: ['tap', 'playwright'],
                counts: {total: 16, passed: 15, failed: 0, flaky: 1, skipped: 0, todo: 0},
                failures: [
                    {
                        suite: 'profile.play.ts',
                        test: 'shows personal details and allows editing the profile',
                        status: 'flaky',
                        runner: 'playwright',
                    },
                ],
            },
        ],
    };

    const diagnosis = await diagnose({
        target: {...TARGET, run: 621},
        bundle: flaky,
        history: [621],
    });

    t.equal(diagnosis.red, false, 'a retry that passed is not a failure');
    t.equal(diagnosis.totals.flaky, 1, 'and the flaky test is still reported');
    t.equal(diagnosis.totals.failed, 0, 'with no failure counted');
    t.match(
        diagnosis.notes.join('\n'),
        /flaky test\(s\) sit in the bundle and none of them failed/,
        'and the note explains why a bundle exists for a green run',
    );
    t.end();
});

test('a leg the bundle already knows is not reported twice', async t => {
    // The shape after the publisher fix: `blong-log`'s Storybook leg writes a slice of its own, so
    // the bundle names its failure and the artifact's report names the same test. The leg-gap path
    // is a safety net for the shape that has no slice, not a second opinion about the one that has
    // (@@F-539).
    const bundle = bundleOf();
    bundle.packages.push({
        package: 'blong-log',
        path: 'tools/blong-log',
        runners: ['tap', 'storybook'],
        counts: {total: 104, passed: 103, failed: 1, flaky: 0, skipped: 0, todo: 0},
        failures: [
            {
                suite: 'LogViewer',
                test: 'LogViewer › FilteredServer › smoke-test',
                status: 'failed',
                runner: 'storybook',
            },
        ],
    });
    const report: IReport = {
        schema: 1,
        package: 'blong-log',
        path: 'tools/blong-log',
        status: 'failed',
        counts: {total: 104, passed: 103, failed: 1, flaky: 0, skipped: 0, todo: 0},
        generatedAt: '2026-10-16T00:00:00.000Z',
        runs: [
            {
                runner: 'storybook',
                status: 'failed',
                counts: {total: 22, passed: 21, failed: 1, flaky: 0, skipped: 0, todo: 0},
                durationMs: 76_000,
                generatedAt: '2026-10-16T00:00:00.000Z',
                suites: [
                    {
                        name: 'LogViewer.stories.tsx',
                        file: 'src/client/LogViewer.stories.tsx',
                        status: 'failed',
                        counts: {total: 22, passed: 21, failed: 1, flaky: 0, skipped: 0, todo: 0},
                        tests: [
                            {
                                name: 'LogViewer › FilteredServer › smoke-test',
                                status: 'failed',
                                message: 'was 0.527% different',
                            },
                        ],
                    },
                ],
            },
        ],
    };

    const diagnosis = await diagnose({
        target: TARGET,
        bundle,
        operations: OPERATIONS,
        history: [622],
        evidence: {
            ...evidenceOf(),
            report: pkgPath => (pkgPath === 'tools/blong-log' ? report : undefined),
            logFailures: () => [],
        },
    });

    const log = diagnosis.packages.find(pkg => pkg.package === 'blong-log');
    t.equal(log?.failures.length, 1, 'the failure is listed once');
    t.equal(log?.legGap, undefined, 'and the package is not a leg gap');
    t.equal(log?.failures[0]?.runner, 'storybook', 'attributed to the leg that failed');
    t.equal(diagnosis.totals.tests, 3, 'the run accounts for three failures');
    t.notMatch(
        diagnosis.notes.join('\n'),
        /was not in the bundle/,
        'and nothing is reported as missing from it',
    );
    t.end();
});

test('a run with no bundle is not reported as green without a witness', async t => {
    const diagnosis = await diagnose({target: TARGET, operations: OPERATIONS, history: [622]});

    t.equal(diagnosis.packages.length, 3, 'the operation summary still names the failures');
    t.match(
        diagnosis.notes.join('\n'),
        /the run published no failure bundle/,
        'and the missing bundle is a note, not a verdict',
    );
    t.end();
});
