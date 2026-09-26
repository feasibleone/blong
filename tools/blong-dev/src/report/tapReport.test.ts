/**
 * Unit tests for the pure parts of the tap runner (report/tapReport.ts).
 *
 * The runner itself spawns tap, so what is checked here is the decision it makes
 * before that: which arguments tap is given (both artifacts are files, so this
 * process never holds the report) and whether the raw TAP stream is echoed back in
 * a watched run.
 */

import {test} from 'tap';

import {isWatchedRun, REPORT_FLAG, tapInvocation} from './tapReport.ts';

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
        'a watched run is given only the caller\'s arguments: their reporter is the live one',
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
