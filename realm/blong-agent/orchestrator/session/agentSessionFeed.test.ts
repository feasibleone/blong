import {test} from 'tap';

import {feedTokenParse, sessionFeedFrame, sessionFeedStart} from './agentSessionFeed.ts';

/**
 * Where a session's watch starts and what one frame carries (`T-793`, `@@D-996`).
 *
 * The arithmetic is what a page depends on being right: a tail computed from the high watermark, the
 * session's own partition when the row remembers one, every partition's tail when it does not, and a
 * token that stops a reconnect from drawing a section twice.
 */
const offsets = [
    {partition: 0, low: 10, high: 60},
    {partition: 1, low: 0, high: 5000},
];

test('a known partition is read from high minus the tail', t => {
    const start = sessionFeedStart(offsets, {partition: 1, tail: 100});
    t.same(start.starts, [{partition: 1, offset: 4900}], 'one start, on the session’s partition');
    t.equal(start.reachedStart, false, 'and the topic holds more before it');
    const oldest = sessionFeedStart(offsets, {partition: 0, tail: 500});
    t.same(
        oldest.starts,
        [{partition: 0, offset: 10}],
        'a tail longer than the partition stops at its low',
    );
    t.equal(oldest.reachedStart, true, 'which is the start of what the topic still holds');
    t.end();
});

test('an unknown partition reads the tail of every partition', t => {
    const start = sessionFeedStart(offsets, {tail: 100});
    t.equal(start.starts.length, 2, 'a key cannot be hashed back, so every partition is looked at');
    t.same(
        start.starts.map(entry => entry.partition),
        [0, 1],
        'in partition order',
    );
    t.ok(
        start.starts[1].offset > offsets[1].high - 100,
        'with the window divided across them rather than repeated',
    );
    t.equal(
        sessionFeedStart(offsets, {partition: 7, tail: 10}).starts.length,
        2,
        'a partition the topic no longer has falls back to all of them',
    );
    t.end();
});

test('a token names a position, and only a well-formed one counts', t => {
    t.same(feedTokenParse('3:918273'), {partition: 3, offset: 918273}, 'partition and offset');
    t.equal(feedTokenParse(undefined), undefined, 'no token is no position');
    t.equal(
        feedTokenParse('nonsense'),
        undefined,
        'and a broken one is ignored rather than trusted',
    );
    t.end();
});

test('a frame carries its events, or only where it stands', t => {
    const record = {
        partition: 1,
        offset: 42,
        value: JSON.stringify({
            sessionId: 's-1',
            seq: 3,
            kind: 'message',
            payload: {text: 'hi'},
            at: 1,
        }),
    };
    const full = sessionFeedFrame(record);
    t.equal(full?.last, '1:42', 'the token a reader resumes from');
    t.equal(full?.events?.length, 1, 'the event the record carried');
    t.equal(full?.events?.[0].kind, 'message', 'mapped as the feed carries it');
    const cursor = sessionFeedFrame(record, {details: false});
    t.notOk(cursor?.events, 'a cursor-only frame carries no events');
    t.equal(cursor?.size, record.value.length, 'but says how big the record is');
    t.end();
});

test('a reader is not shown a record it handed back', t => {
    const record = {partition: 1, offset: 42, value: '{}'};
    t.equal(
        sessionFeedFrame(record, {after: '1:42'}),
        undefined,
        'the record at the token is one the reader already rendered',
    );
    t.equal(sessionFeedFrame(record, {after: '1:41'})?.offset, 42, 'and the next one is news');
    t.equal(
        sessionFeedFrame(record, {after: '0:900'})?.offset,
        42,
        'a token on another partition says nothing about this one',
    );
    t.end();
});
