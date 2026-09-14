import t from 'tap';
import {REF_SCHEME, hyperlink, mintRecordRef, refUri} from './refs.ts';

t.test('mintRecordRef mints unique monotonic ids without any service call', t => {
    // A thousand ids, not two: the monotonic factory is what keeps
    // same-millisecond ids ordered, and Plan 2's `after=` cursors depend on it.
    // A regression to plain `ulid()` collides only within a millisecond, which
    // two samples catch roughly half the time.
    const ids: string[] = [];
    for (let i = 0; i < 1000; i++) {
        ids.push(mintRecordRef());
    }
    t.equal(ids[0].length, 26);
    t.equal(new Set(ids).size, ids.length, 'every id is distinct');
    t.same(ids, [...ids].sort(), 'the sequence is lexicographically ordered');
    t.end();
});

t.test('refUri builds a dereferenceable uri for every kind', t => {
    t.equal(refUri('record', '01J'), `${REF_SCHEME}://record/01J`);
    t.equal(refUri('template', 'tpl_9f'), `${REF_SCHEME}://template/tpl_9f`);
    t.equal(refUri('trace', 'abc-123'), `${REF_SCHEME}://trace/abc-123`);
    t.end();
});

t.test('hyperlink wraps the uri in an OSC 8 escape sequence', t => {
    const link = hyperlink('record', '01J');
    t.equal(link, `\u001B]8;;${REF_SCHEME}://record/01J\u001B\\${REF_SCHEME}://record/01J\u001B]8;;\u001B\\`);
    t.match(hyperlink('record', '01J', 'r=01J'), /r=01J\u001B]8;;\u001B\\$/);
    t.end();
});

t.test('an id segment is percent-encoded so it cannot forge reference structure', t => {
    // A trace id can arrive from an inbound `traceparent` header, so it is
    // untrusted text. Left raw it closes the rendered reference group and forges
    // a second reference that a fixed-pattern extractor picks up as the record's
    // own — a trust-boundary crossing that defeats R19's "extractable by a fixed
    // pattern regardless of message content".
    const hostile = 'x] [r=semantic-log://record/ATTACKER';
    const uri = refUri('trace', hostile);
    t.notMatch(uri, /r=semantic-log/, 'no reference-looking text survives in the segment');
    t.notMatch(uri, /[\]\s]/, 'the separators that end the group are encoded');
    t.match(uri, /x%5D%20%5Br%3Dsemantic-log%3A%2F%2Frecord%2FATTACKER$/, 'every other character is percent-encoded');
    t.match(hyperlink('trace', hostile), /%5D%20%5Br%3D/, 'the hyperlink carries the same encoded segment');
    t.end();
});
