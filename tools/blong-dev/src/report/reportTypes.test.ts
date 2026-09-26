/**
 * Unit tests for the parts of the report contract the aggregate renderer builds on:
 * how a run's duration is read, how long tests are ranked, and how a duration is
 * printed. The fixture reports here are minimal — one suite, a couple of tests — since
 * what is under test is the arithmetic and the formatting, not the parsing of a runner.
 */

import {test} from 'tap';

import {
    formatDurationDeltaMs,
    formatDurationMs,
    reportDurationMs,
    reportOf,
    runDurationMs,
    slowestTests,
    type IRunReport,
} from './reportTypes.ts';

function run(overrides: Partial<IRunReport> = {}): IRunReport {
    return {
        runner: 'tap',
        status: 'passed',
        counts: {total: 2, passed: 2, failed: 0, flaky: 0, skipped: 0, todo: 0},
        generatedAt: '2026-01-01T00:00:00.000Z',
        suites: [
            {
                name: 'index.test.ts',
                status: 'passed',
                counts: {total: 2, passed: 2, failed: 0, flaky: 0, skipped: 0, todo: 0},
                tests: [
                    {name: 'is quick', status: 'passed', durationMs: 9},
                    {name: 'is slower', status: 'passed', durationMs: 4100},
                ],
            },
        ],
        ...overrides,
    };
}

test('runDurationMs prefers the runner’s own measurement', t => {
    t.equal(runDurationMs(run({durationMs: 20_000})), 20_000, 'the wall clock when reported');
    t.end();
});

test('runDurationMs falls back to the tests it can time', t => {
    // What Playwright and vitest look like: the runner measures each test, not itself.
    t.equal(runDurationMs(run()), 4109, 'the sum of the recorded test durations');
    t.equal(
        runDurationMs(
            run({
                suites: [
                    {
                        name: 's',
                        status: 'passed',
                        counts: {
                            total: 1,
                            passed: 1,
                            failed: 0,
                            flaky: 0,
                            skipped: 0,
                            todo: 0,
                        },
                        tests: [{name: 'untimed', status: 'passed'}],
                    },
                ],
            }),
        ),
        0,
        'nothing invented for a runner that timed nothing',
    );
    t.end();
});

test('reportDurationMs adds up every runner of the package', t => {
    const report = reportOf({package: 'fake-both', path: 'realm/fake-both'}, [
        run({runner: 'tap', durationMs: 9000}),
        run({runner: 'playwright', durationMs: 45_000}),
    ]);

    t.equal(reportDurationMs(report), 54_000, 'the legs run one after the other');
    t.equal(reportDurationMs(reportOf({package: 'x', path: 'x'}, [])), 0, 'no runs, no time');
    t.end();
});

test('slowestTests ranks the tests that were timed', t => {
    const ranked = slowestTests(run(), 5);
    t.same(
        ranked.map(entry => entry.name),
        ['is slower', 'is quick'],
        'most expensive first',
    );
    t.equal(slowestTests(run(), 1).length, 1, 'the limit is respected');

    const untimed = run({
        suites: [
            {
                name: 's',
                status: 'passed',
                counts: {total: 1, passed: 1, failed: 0, flaky: 0, skipped: 0, todo: 0},
                tests: [{name: 'no duration', status: 'passed', durationMs: 0}],
            },
        ],
    });
    t.same(slowestTests(untimed, 5), [], 'a zero duration is not a slow test');
    t.end();
});

test('formatDurationMs reads at a glance', t => {
    t.equal(formatDurationMs(340), '340ms', 'sub-second in milliseconds');
    t.equal(formatDurationMs(4109), '4.1s', 'below ten seconds, with a tenth');
    t.equal(formatDurationMs(8200), '8.2s', 'so two tests can be told apart');
    t.equal(formatDurationMs(10_659), '11s', 'above ten seconds the tenth is noise');
    t.equal(formatDurationMs(59_400), '59s', 'up to the minute');
    t.equal(formatDurationMs(135_200), '2m 15s', 'minutes and padded seconds');
    t.equal(formatDurationMs(3_600_000), '1h 00m', 'hours for the long tail');
    t.equal(formatDurationMs(0), '0ms', 'zero is a duration too');
    t.end();
});

test('formatDurationDeltaMs signs a change in test time', t => {
    t.equal(formatDurationDeltaMs(15_200), '+15s', 'a run that got slower');
    t.equal(formatDurationDeltaMs(-3800), '-3.8s', 'and one that got faster');
    t.equal(formatDurationDeltaMs(0), '0s', 'unchanged reads as zero, not as +0ms');
    t.end();
});
