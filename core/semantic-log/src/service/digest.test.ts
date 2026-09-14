import t from 'tap';
import {DigestLog} from './digest.ts';

t.test('entries carry a monotonic cursor', t => {
    const log = new DigestLog({limit: 100});
    const first = log.publish('template-added', {ref: 'a'});
    const second = log.publish('anomaly', {ref: 'a', kind: 'novelty'});
    t.equal(first.seq, 1);
    t.equal(second.seq, 2);
    t.equal(log.latest(), 2);
    t.end();
});

t.test('reading from a cursor returns only newer entries (PRD R8)', t => {
    const log = new DigestLog({limit: 100});
    log.publish('template-added', {ref: 'a'});
    log.publish('template-added', {ref: 'b'});
    const since1 = log.read(1);
    t.equal(since1.length, 1);
    t.equal((since1[0].data as {ref: string}).ref, 'b');
    t.equal(log.read(0).length, 2);
    t.equal(log.read(2).length, 0);
    t.end();
});

t.test('reading respects a limit', t => {
    const log = new DigestLog({limit: 100});
    for (let i = 0; i < 10; i++) log.publish('anomaly', {i});
    t.equal(log.read(0, 3).length, 3);
    t.end();
});

t.test('a lagging consumer is told it missed entries, not silently short-changed', t => {
    const log = new DigestLog({limit: 5});
    for (let i = 0; i < 12; i++) log.publish('anomaly', {i});
    const page = log.read(0);
    t.equal(page.length, 5, 'bounded by the log limit');
    t.equal(log.stats().dropped, 7);
    t.ok(log.stats().oldest > 1, 'the oldest surviving cursor moved forward');
    t.end();
});

t.test('the cursor of a dropped entry is never reissued to a newer one', t => {
    const log = new DigestLog({limit: 2});
    for (let i = 0; i < 5; i++) log.publish('incident', {i});
    t.same(
        log.read(0).map(entry => entry.seq),
        [4, 5],
        'the survivors keep the cursors they were issued under',
    );
    t.equal(log.stats().retained, 2);
    t.equal(log.stats().oldest, 4);
    t.same(log.read(4).map(entry => entry.seq), [5], 'a cursor still addresses the entries newer than it');
    t.end();
});

t.test('an empty log reports the next cursor, not one it has not reached', t => {
    const log = new DigestLog({limit: 10});
    t.same(log.stats(), {dropped: 0, retained: 0, oldest: 1}, 'nothing has been published yet');
    log.publish('template-added', {ref: 'a'});
    t.equal(log.stats().oldest, 1, 'and the sole entry is the oldest');
    t.end();
});

t.test('the clock is injectable, so a delta can carry a deterministic time', t => {
    const log = new DigestLog({limit: 10, now: () => 1234});
    t.equal(log.publish('template-retired', {ref: 'a'}).at, 1234);
    t.equal(log.read(0)[0].at, 1234, 'and the stored entry carries the injected time');
    t.end();
});

t.test('a caller cannot mutate what the log holds, through either return path', t => {
    const log = new DigestLog({limit: 10});
    const published = log.publish('template-added', {ref: 'a'});
    published.seq = 99;
    published.kind = 'incident';
    const read = log.read(0);
    read[0].seq = 42;
    read[0].kind = 'incident';
    t.same(
        log.read(0).map(entry => [entry.seq, entry.kind]),
        [[1, 'template-added']],
        'the stored entry survived both the publish and the read handle',
    );
    t.end();
});

t.test('a limit that is not a non-negative integer is rejected, not clamped', t => {
    for (const limit of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        t.throws(
            () => new DigestLog({limit}),
            TypeError,
            `limit ${limit} is not a count of entries, and a negative one would hang publish`,
        );
    }
    const zero = new DigestLog({limit: 0});
    t.equal(zero.publish('anomaly', {}).seq, 1, 'zero is a valid bound: the entry is issued before it is evicted');
    t.same(zero.stats(), {dropped: 1, retained: 0, oldest: 2}, 'and the log stays empty without hanging');
    t.end();
});
