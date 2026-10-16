/**
 * Unit tests for the pure parts of the tap runner (report/tapReport.ts).
 *
 * The runner itself spawns tap, so what is checked here is the decision it makes
 * before that: which arguments tap is given (both artifacts are files, so this
 * process never holds the report) and whether the raw TAP stream is echoed back in
 * a watched run.
 */

import {test} from 'tap';

import {buildTapRun, isWatchedRun, REPORT_FLAG, tapInvocation} from './tapReport.ts';

test('tapInvocation asks a captured run for its report and keeps a watched one live', t => {
    const args = ['*.test.ts', '--timeout=180'];
    t.same(
        tapInvocation('/pkg/.ci-report/tap.json', '/pkg/.ci-report/tap.raw.tap', args, false),
        [
            '--reporter=json',
            '--reporter-file=/pkg/.ci-report/tap.json',
            '--output-file=/pkg/.ci-report/tap.raw.tap',
            ...args,
        ],
        'a captured run writes both artifacts itself',
    );
    t.same(
        tapInvocation('/pkg/.ci-report/tap.json', '/pkg/.ci-report/tap.raw.tap', args, true),
        args,
        "a watched run is given only the caller's arguments: their reporter is the live one",
    );
    t.end();
});

test('isWatchedRun reads a watched run from the environment', t => {
    t.equal(isWatchedRun({}), true, 'a dev run is watched');
    t.equal(isWatchedRun({CI: '1'}), false, 'a CI run is captured');
    t.equal(isWatchedRun({CI: 'true'}), false, 'any CI value counts');
    t.equal(isWatchedRun({CI: ''}), true, 'an empty CI value is not a CI run');
    t.end();
});

/**
 * The group shape of build #622: a `timeout!` case under the group whose budget expired,
 * with the group's `at` as the only location and the handle dump as the only clue about
 * what was still running (@@F-539, @@F-540).
 */
const timedOutGroup = (expired: string) => ({
    name: 'kukum meta endpoints over the gateway',
    ok: false,
    time: 60_044,
    failures: 1,
    diag: {at: {fileName: 'index.test.ts', lineNumber: 27, columnNumber: 11}},
    cases: [
        {ok: true, name: 'kukum.instruction.find responded 200'},
        {ok: true, name: 'instruction.find returns a file list'},
        {
            ok: false,
            name: 'timeout!',
            diag: {
                expired,
                handles: [
                    {type: 'Socket'},
                    {type: 'Socket'},
                    {type: 'Server'},
                    {type: 'ChildProcess'},
                ],
            },
        },
    ],
});

test('an expired budget reaches the report as a reason, not a bare failure', t => {
    const report = buildTapRun(
        {suites: [{name: 'index.test.ts', ok: false, suites: [timedOutGroup('TAP')]}]},
        1,
    );

    const failure = report.suites[0]?.tests.find(entry => entry.status === 'failed');
    t.equal(
        failure?.name,
        'kukum meta endpoints over the gateway › timeout!',
        'the synthesised case is the failing test',
    );
    t.match(failure?.message, /^timeout: the run's own budget expired/, 'the expiry is named');
    t.match(
        failure?.message,
        /still open when the budget expired: Socket×2, ChildProcess×1, Server×1/,
        'and what was still open, by type',
    );
    t.equal(failure?.file, 'index.test.ts', 'the location comes from the group');
    t.equal(failure?.line, 27, 'including the line whose budget expired');
    t.end();
});

test('an expiry of a file names the file, not the run', t => {
    const report = buildTapRun(
        {suites: [{name: 'index.test.ts', ok: false, suites: [timedOutGroup('index.test.ts')]}]},
        1,
    );

    const failure = report.suites[0]?.tests.find(entry => entry.status === 'failed');
    t.match(failure?.message, /the budget of index\.test\.ts expired/, 'the expired test is named');
    t.end();
});

test('a run that died without a failing test says where the reason is', t => {
    const report = buildTapRun(
        {
            suites: [
                {
                    name: 'index.test.ts',
                    ok: true,
                    suites: [{name: 'a group', ok: true, cases: [{ok: true, name: 'clean'}]}],
                },
            ],
        },
        1,
    );

    const failure = report.suites.at(-1)?.tests[0];
    t.equal(failure?.name, 'tap exited with code 1 without reporting a failing test', 'the entry');
    t.match(failure?.message, /see tap\.raw\.tap in the same directory/, 'it points at the stream');
    t.equal(report.counts.failed, 1, 'and the run is never reported green');
    t.end();
});
