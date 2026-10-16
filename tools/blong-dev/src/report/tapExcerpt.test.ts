/**
 * Tests for the raw-stream excerpt.
 *
 * The fixtures are the shapes tap really wrote in build #622, where two runs failed on
 * expired budgets and were reported without a reason (F-539, F-540): the `timeout!` case
 * tap synthesises for an expired test, and the file-level expiry that leaves no named
 * entry in `tap.json` at all.
 */
import {test} from 'tap';

import {tapExcerpt} from './tapExcerpt.ts';

/** The block tap wrote for a group whose 60s budget expired mid-test. */
const GROUP_EXPIRY = [
    '    # Subtest: kukum meta endpoints over the gateway',
    '        ok 12 - kukum.instruction.find responded 200',
    '        ok 13 - instruction.find returns a file list',
    '        not ok 14 - timeout!',
    '          ---',
    '          signal: null',
    '          handles:',
    '            - type: Server',
    '              events:',
    '                - request',
    '                - connection',
    '            - type: Socket',
    '              events:',
    '                - close',
    '                - error',
    '            - type: ChildProcess',
    '              events:',
    '                - error',
    '                - close',
    '          expired: TAP',
    '          ...',
    '',
    '        1..14',
    '    not ok 2 - kukum meta endpoints over the gateway # time=60044.272ms',
    '      ---',
    '      at:',
    '        fileName: index.test.ts',
    '        lineNumber: 27',
    '    1..2',
    '',
].join('\n');

/** The tail of a file whose own budget expired, as `tap` left it. */
const FILE_EXPIRY = [
    '    # Subtest: the exit code says whether the command did what was asked',
    '        ok 1 - an unknown method fails',
    '        ok 4 - --help is not a failure',
    '        1..4',
    '    ok 4 - the exit code says whether the command did what was asked # time=22190.563ms',
    '',
    '    # test count(4) != plan(null)',
    'not ok 1 - timeout!',
    '  ---',
    '  expired: index.test.ts',
    '  ...',
    '',
    '# ERROR: incomplete statements coverage (98.81%)',
    '# ERROR: incomplete branches coverage (90.32%)',
    '# { total: 12, pass: 11, fail: 1 }',
    '# time=67938.161ms',
    '',
].join('\n');

test('the excerpt starts at the failing line and keeps what came before it', async t => {
    const excerpt = tapExcerpt(GROUP_EXPIRY, 'kukum meta endpoints over the gateway › timeout!');

    t.match(excerpt, /^ok 13 - instruction.find returns a file list$/m, 'the last passing assert');
    t.match(excerpt, /^not ok 14 - timeout!$/m, 'the failing line');
    t.match(excerpt, /expired: TAP/, 'the expired budget');
    t.match(excerpt, /^# Subtest: kukum meta endpoints over the gateway$/m, 'and its group');
});

test('the handle dump is collapsed to a count of what it listed', async t => {
    const excerpt = tapExcerpt(GROUP_EXPIRY, 'kukum meta endpoints over the gateway › timeout!');

    t.match(excerpt, /… 3 open handle\(s\) dropped/, 'three entries, one line');
    t.notMatch(excerpt, /- type: Socket/, 'none of the entries survive');
    t.notMatch(excerpt, /- close/, 'nor the event lists under them');
});

test('a synthesised case is found by its own name, not its group', async t => {
    const case_ = tapExcerpt(GROUP_EXPIRY, 'index.test.ts › kukum meta endpoints › timeout!');
    const group = tapExcerpt(GROUP_EXPIRY, 'index.test.ts › kukum meta endpoints over the gateway');

    t.match(case_, /^not ok 14 - timeout!$/m, 'the innermost entry wins');
    t.match(group, /^not ok 2 - kukum meta endpoints over the gateway/m, 'a group reports itself');
});

test('a failure the stream does not name falls back to the last one in it', async t => {
    const excerpt = tapExcerpt(
        FILE_EXPIRY,
        'tap exited with code 1 without reporting a failing test',
    );

    t.match(excerpt, /^not ok 1 - timeout!$/m, 'the file-level expiry');
    t.match(excerpt, /expired: index\.test\.ts/, 'and the test whose budget it was');
    t.match(excerpt, /incomplete statements coverage/, 'the coverage gate that failed with it');
    t.match(excerpt, /# time=67938\.161ms/, "and the run's own time");
});

test('long lines are cut and short ones are left alone', async t => {
    const raw = ['not ok 1 - a test', `  message: ${'x'.repeat(400)}`, '  ...'].join('\n');
    const excerpt = tapExcerpt(raw, 'nothing › a test', {maxLineLength: 40});
    const lines = (excerpt ?? '').split('\n');

    t.equal(lines[0], 'not ok 1 - a test', 'the failing line is untouched');
    t.equal(lines[1]?.length, 40, 'the long line is cut to the cap');
    t.match(lines[1], /…$/, 'and says so');
});

test('a stream with nothing to quote yields nothing', async t => {
    t.equal(tapExcerpt('', 'anything'), undefined, 'an empty stream');
    t.equal(tapExcerpt('\n\n\n', 'anything'), undefined, 'blank lines only');
});

test('the excerpt is rebased so the failing line reads at column zero', async t => {
    const excerpt = tapExcerpt(GROUP_EXPIRY, 'timeout!', {before: 0, after: 2});
    const lines = (excerpt ?? '').split('\n');

    t.equal(lines[0], 'not ok 14 - timeout!', 'the line the reader came for');
    t.equal(lines[1], '  ---', 'with the diagnostics still indented under it');
});
