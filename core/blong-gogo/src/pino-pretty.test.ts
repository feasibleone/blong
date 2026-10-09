import {PassThrough} from 'node:stream';
import t from 'tap';
import pretty from './pino-pretty.ts';

/**
 * The `semlog://` reference group has two producers (D-…, Q8): the semantic
 * renderer, and this printer — the one a process that did *not* choose the
 * semantic implementation reaches. A released process turns both off with
 * `log.refs: false`, and this is the half whose switch travels as a transport
 * option, so it is the half a config merge can quietly fail to reach.
 *
 * The printer is driven directly rather than through pino: the transport runs in
 * a worker thread in a real process, and what is under test is the line the
 * printer builds, not pino's plumbing to get there.
 */
function print(options: {refs?: boolean}, record: Record<string, unknown>): Promise<string> {
    // The pretty text goes to the printer's *destination*, not to the stream it
    // returns (that one passes the input through), so the destination is what
    // this captures.
    const sink = new PassThrough();
    const stream = pretty({colorize: false, destination: sink, ...options} as never);
    return new Promise<string>((resolve, reject) => {
        let out = '';
        sink.on('data', chunk => {
            out += String(chunk);
        });
        stream.on('error', reject);
        // A pino transport is written lines, not objects: the printer parses each
        // one, which is what makes `refs` a property of the printer rather than of
        // the record.
        stream.write(`${JSON.stringify({level: 30, time: 1757765472345, ...record})}\n`);
        // The stream flushes per line asynchronously, so the assertion waits a beat
        // rather than racing it; a stream that never writes fails loudly instead of
        // hanging the suite.
        setTimeout(() => resolve(out), 250);
    });
}

t.test('an ordinary record prints its reference group', async t => {
    const line = await print({}, {msg: 'quote accepted', id: '01J8Z9K2M9PQRSTVWXYZ0A1B2C'});
    t.match(line, /semlog:\/\/r\/01J8Z9K2M9PQRSTVWXYZ0A1B2C/, 'the link is on the line');
});

t.test('a released process prints none', async t => {
    const line = await print(
        {refs: false},
        {msg: 'quote accepted', id: '01J8Z9K2M9PQRSTVWXYZ0A1B2C'},
    );
    t.notMatch(line, /semlog:\/\//, 'the group is gone');
    t.match(line, /quote accepted/, 'and the record is still printed');
});

// The header lifts `$meta.mtid` and `$meta.method` onto the line, so the detail beneath it must not
// print them a second time — and an envelope that held only those two must not be left behind as an
// empty object, which is what an `ignore` entry for each key produced.

t.test('the envelope the header printed is not detailed beneath it', async t => {
    const line = await print(
        {},
        {msg: 'adapter.start', $meta: {mtid: 'event', method: 'adapter.start'}},
    );
    t.match(line, /event/, 'the header carries the envelope');
    t.notMatch(line, /\$meta/, 'and the detail does not repeat it');
});

t.test('what is left of the envelope is still printed', async t => {
    const line = await print(
        {},
        {msg: 'a pass ran', $meta: {mtid: 'event', method: 'reconcile.run', forward: 'x-1'}},
    );
    t.match(line, /"forward":\s*"x-1"/, 'a member with no slot of its own stays, with its value');
    t.notMatch(line, /"method"/, 'while the one that reached the header does not');
});

t.test('a member that was not lifted stays where a reader can see it', async t => {
    // Only a *string* is lifted, so a `mtid` of the wrong shape never reached the header and removing
    // it would lose what the request carried.
    const line = await print({}, {msg: 'odd call', $meta: {mtid: 1, method: 'a.b'}});
    t.match(line, /"mtid":\s*1/, 'the value the header could not print is still there');
    t.notMatch(line, /"method"/, 'and the one it could print is not');
});
