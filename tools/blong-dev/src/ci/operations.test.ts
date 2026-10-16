/**
 * Tests for reading a run's operation summary out of its job log.
 *
 * The fixture is the shape build #622 really printed — the harness's `--[ FAILURE: … ]--` headers
 * with GitHub's timestamps in front of every line, one operation that failed with a report and one
 * that failed without — because the parsing is entirely about that shape (@@F-539).
 */
import {test} from 'tap';

import {parseOperationResults} from './operations.ts';

const LOG = [
    '2026-10-15T19:33:19.5544551Z ==[ FAILURE: 3 operations ]==================',
    '2026-10-15T19:33:19.5557245Z --[ FAILURE: @feasibleone/blong-cli ]---------------[ 1 minute 10.6 seconds ]--',
    '2026-10-15T19:33:19.5558149Z ',
    '2026-10-15T19:33:19.5558991Z Invoking (initial): blong-dev test ',
    '2026-10-15T19:33:19.5558991Z ✖ tap exited with code 1 without reporting a failing test',
    '2026-10-15T19:33:19.5559439Z # blong-cli: 11 passed, 1 failed (12 total)',
    '2026-10-15T19:33:19.5560844Z Returned error code: 1',
    '2026-10-15T19:33:19.5561301Z --[ FAILURE: @feasibleone/blong-log ]------------[ 1 minute 56.8 seconds ]--',
    '2026-10-15T19:33:19.5565847Z ',
    '2026-10-15T19:33:19.5565847Z Invoking (initial): rc=0; blong-dev test || rc=$?; node --run storybook:test:ci || rc=$?; exit $rc ',
    '2026-10-15T19:33:19.5565847Z Invoking "rush ci-coverage"',
    '2026-10-15T19:33:19.5565847Z # blong-log: 82 passed, 0 failed (82 total)',
    '2026-10-15T19:33:19.5581740Z Returned error code: 1',
    '2026-10-15T19:33:19.5582000Z ',
    '2026-10-15T19:33:19.5582100Z ==[ SUCCESS WITH WARNINGS: 1 operations ]==================',
    '2026-10-15T19:33:19.5582200Z ',
    '2026-10-15T19:33:19.5582300Z --[ WARNING: @feasibleone/blong-gateway ]----------[ 4 minutes 42.3 seconds ]--',
    '2026-10-15T19:33:19.5582400Z [browser] pageerror: [test] deliberate page error',
    '2026-10-15T19:33:19.5582500Z ',
    '2026-10-15T19:33:19.5582600Z Operations failed.',
].join('\n');

test('the operation summary is read with its verdicts and timings', t => {
    const operations = parseOperationResults(LOG);

    t.equal(operations.length, 3, 'every operation in the summary');
    t.same(
        operations.map(operation => [operation.package, operation.verdict]),
        [
            ['blong-cli', 'failure'],
            ['blong-log', 'failure'],
            ['blong-gateway', 'warning'],
        ],
        'failures first, warnings after',
    );
    t.equal(operations[0]?.durationText, '1 minute 10.6 seconds', 'the harness clock is kept');
    t.equal(operations[0]?.commands[0], 'blong-dev test', 'the initial command is quoted');
    t.same(
        operations[1]?.commands.length,
        1,
        'the coverage step that follows an operation is not a command of it',
    );
    t.match(
        operations[1]?.detail.join('\n'),
        /# blong-log: 82 passed, 0 failed/,
        'its verdict line',
    );
    t.notMatch(
        operations[1]?.detail.join('\n') ?? '',
        /Returned error code/,
        'the exit code line is not a reason',
    );
    t.end();
});

test('a log with no summary yields nothing rather than a guess', t => {
    t.same(parseOperationResults('some ordinary build output\n'), [], 'no headers, no operations');
    t.same(parseOperationResults(''), [], 'an empty log');
    t.end();
});
