import t from 'tap';
import {LineageIndex} from './lineage.ts';
import type {IngestEvent} from './registry.ts';

function event(overrides: Partial<IngestEvent> & {id: string; time: number}): IngestEvent {
    return {
        fingerprint: `fp-${overrides.id}`,
        service: 'payer',
        refs: {record: overrides.id, trace: 'tr-1'},
        ...overrides,
    } as IngestEvent;
}

const flow: IngestEvent[] = [
    event({id: 'n1', time: 10, service: 'payer', intent: {name: 'User_Transfer'}}),
    event({id: 'n2', time: 20, service: 'hub', refs: {record: 'n2', trace: 'tr-1', parent: 'n1'}}),
    event({
        id: 'n3',
        time: 30,
        service: 'payee',
        refs: {record: 'n3', trace: 'tr-1', parent: 'n2'},
    }),
];

t.test('a chain is walked from root to leaf (PRD R7 acceptance)', t => {
    const index = new LineageIndex();
    for (const item of flow) index.add(item);
    t.same(
        index.chain('n3').map(node => node.id),
        ['n1', 'n2', 'n3'],
    );
    t.equal(index.rootOf('n3'), 'n1');
    t.end();
});

t.test('a trace spans services in time order, parent links or not', t => {
    const index = new LineageIndex();
    for (const item of flow) index.add(item);
    index.add(event({id: 'n4', time: 40, service: 'payee'}));
    t.same(
        index.trace('tr-1').map(node => node.service),
        ['payer', 'hub', 'payee', 'payee'],
    );
    t.end();
});

t.test('intent set at the entry point is visible for the whole trace (PRD R7)', t => {
    const index = new LineageIndex();
    for (const item of flow) index.add(item);
    t.same(index.intentsOf('tr-1'), ['User_Transfer']);
    t.end();
});

t.test('a cycle in malformed parent links cannot hang the walk', t => {
    const index = new LineageIndex();
    index.add(event({id: 'a', time: 1, refs: {record: 'a', trace: 't', parent: 'b'}}));
    index.add(event({id: 'b', time: 2, refs: {record: 'b', trace: 't', parent: 'a'}}));
    t.same(
        index.chain('a').map(node => node.id),
        ['b', 'a'],
        'the walk returns the cycle once, ending where it re-entered',
    );
    t.same(
        index.chain('b').map(node => node.id),
        ['a', 'b'],
        'and the same from the other node',
    );
    t.end();
});

t.test('a self-parenting record terminates at itself', t => {
    const index = new LineageIndex();
    index.add(event({id: 'a', time: 1, refs: {record: 'a', trace: 't', parent: 'a'}}));
    t.same(
        index.chain('a').map(node => node.id),
        ['a'],
        'the record is seen once, not repeated',
    );
    t.equal(index.rootOf('a'), 'a');
    t.end();
});

t.test('a three-node cycle terminates without repeating a node', t => {
    const index = new LineageIndex();
    index.add(event({id: 'a', time: 1, refs: {record: 'a', trace: 't', parent: 'b'}}));
    index.add(event({id: 'b', time: 2, refs: {record: 'b', trace: 't', parent: 'c'}}));
    index.add(event({id: 'c', time: 3, refs: {record: 'c', trace: 't', parent: 'a'}}));
    t.same(
        index.chain('a').map(node => node.id),
        ['c', 'b', 'a'],
        'every node is visited once',
    );
    t.same(
        index.chain('b').map(node => node.id),
        ['a', 'c', 'b'],
        'and the same from another entry point',
    );
    t.end();
});

// --- coverage of the deliberate degradations and defensive surfaces ---

t.test('a record with no reference group still lands, grouped as untraced', t => {
    const index = new LineageIndex();
    const loose = index.add({id: 'loose', time: 5, fingerprint: 'fp-loose', service: 'relay'});
    t.equal(loose.trace, 'untraced', 'a record with no trace is grouped, not dropped');
    t.equal(loose.parent, undefined, 'and it has no parent to walk to');
    t.equal(loose.intent, undefined, 'and no intent');
    t.same(
        index.trace('untraced').map(node => node.id),
        ['loose'],
    );
    t.same(
        index.chain('loose').map(node => node.id),
        ['loose'],
        'it is its own root',
    );
    t.equal(index.rootOf('loose'), 'loose');
    t.end();
});

t.test('records sharing a timestamp are ordered by id, so a trace is stable', t => {
    const index = new LineageIndex();
    index.add(event({id: 'b', time: 7, service: 'second'}));
    index.add(event({id: 'a', time: 7, service: 'first'}));
    t.same(
        index.trace('tr-1').map(node => node.id),
        ['a', 'b'],
    );
    t.end();
});

t.test('an unknown id answers empty rather than throwing', t => {
    const index = new LineageIndex();
    for (const item of flow) index.add(item);
    t.same(index.trace('nope'), [], 'an unknown trace has no records');
    t.same(index.chain('nope'), [], 'an unknown record has no chain');
    t.equal(index.rootOf('nope'), undefined, 'and no root');
    t.same(index.intentsOf('nope'), [], 'and no intents');
    t.end();
});

t.test('a parent that never arrived leaves the record as its own root', t => {
    const index = new LineageIndex();
    index.add(
        event({id: 'orphan', time: 1, refs: {record: 'orphan', trace: 'tr-1', parent: 'missing'}}),
    );
    t.same(
        index.chain('orphan').map(node => node.id),
        ['orphan'],
    );
    t.equal(index.rootOf('orphan'), 'orphan');
    t.end();
});

t.test('the trace array handed out is a copy, not the index itself', t => {
    const index = new LineageIndex();
    for (const item of flow) index.add(item);
    const handedOut = index.trace('tr-1');
    handedOut.length = 0;
    t.same(
        index.trace('tr-1').map(node => node.id),
        ['n1', 'n2', 'n3'],
        'the index survived the caller',
    );
    t.end();
});

t.test('an intent seen twice in a trace is reported once', t => {
    const index = new LineageIndex();
    index.add(event({id: 'i1', time: 1, intent: {name: 'User_Transfer'}}));
    index.add(event({id: 'i2', time: 2, intent: {name: 'User_Transfer'}}));
    index.add(event({id: 'i3', time: 3, intent: {name: 'User_Lookup'}}));
    t.same(index.intentsOf('tr-1'), ['User_Transfer', 'User_Lookup']);
    t.end();
});

t.test('a parent-less trace degrades to time order, however the records arrived', t => {
    const index = new LineageIndex();
    // The ids sort in the opposite order to the times, so a listing that fell
    // back to id order could not pass this.
    index.add(event({id: 'aaa', time: 30, service: 'payee'}));
    index.add(event({id: 'bbb', time: 10, service: 'payer'}));
    index.add(event({id: 'ccc', time: 20, service: 'hub'}));
    t.same(
        index.trace('tr-1').map(node => node.id),
        ['bbb', 'ccc', 'aaa'],
        'time orders the trace when no parent link exists',
    );
    t.end();
});

t.test('the nodes handed out are copies, not the index itself', t => {
    const index = new LineageIndex();
    index.add(event({id: 'n1', time: 10, refs: {record: 'n1', trace: 'tr-1'}}));
    index.add(event({id: 'n2', time: 20, refs: {record: 'n2', trace: 'tr-1', parent: 'n1'}}));
    index.trace('tr-1')[0].id = 'injected';
    index.chain('n2')[0].id = 'injected';
    const added = index.add(
        event({id: 'n3', time: 30, refs: {record: 'n3', trace: 'tr-1', parent: 'n2'}}),
    );
    added.id = 'injected';
    t.same(
        index.trace('tr-1').map(node => node.id),
        ['n1', 'n2', 'n3'],
        'the listing survived the caller',
    );
    t.same(
        index.chain('n2').map(node => node.id),
        ['n1', 'n2'],
        'the walk survived the caller',
    );
    t.equal(index.rootOf('n3'), 'n1', 'and the parent link is still the real one');
    t.end();
});

t.test('a record operation is forwarded to the node', t => {
    const index = new LineageIndex();
    const node = index.add(event({id: 'op1', time: 1, operation: 'POST /transfer'}));
    t.equal(node.operation, 'POST /transfer');
    t.equal(index.trace('tr-1')[0].operation, 'POST /transfer');
    t.end();
});

t.test('the call a record named reaches the node, and a malformed one does not', t => {
    // The leg is what pairs a record with the other end of the same hop, so it
    // has to survive into the trace view. A leg the charset rejects arrived on the
    // wire from another process: it is read as no leg rather than carried, exactly
    // as `legFrom` treats it at the participant (PRD R22, the D3 origin split).
    const index = new LineageIndex();
    const carried = index.add(
        event({
            id: 'leg1',
            time: 1,
            flow: {id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', leg: 'payer.quote.rates'},
        }),
    );
    t.equal(carried.leg, 'payer.quote.rates');
    const malformed = index.add(
        event({id: 'leg2', time: 2, flow: {id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', leg: 'payer;hop'}}),
    );
    t.equal(malformed.leg, undefined, 'a value that is not a leg id is not carried as one');
    const absent = index.add(event({id: 'leg3', time: 3}));
    t.equal(absent.leg, undefined, 'and neither is a record that named no call at all');
    t.end();
});

t.test('a trace that is empty or not a string is untraced, not a trace of its own', t => {
    const index = new LineageIndex();
    const empty = index.add(event({id: 'empty', time: 1, refs: {record: 'empty', trace: ''}}));
    const odd = index.add({
        ...event({id: 'odd', time: 2}),
        refs: {record: 'odd', trace: 42 as unknown as string},
    });
    t.equal(empty.trace, 'untraced', 'an empty trace cannot identify a trace');
    t.equal(odd.trace, 'untraced', 'neither can a value that is not a string');
    t.same(
        index.trace('').map(node => node.id),
        [],
        'nothing is grouped under the empty key',
    );
    t.same(
        index.trace('untraced').map(node => node.id),
        ['empty', 'odd'],
    );
    t.end();
});

t.test('a redelivered id is one listing entry, carrying the newest delivery', t => {
    const index = new LineageIndex();
    index.add(event({id: 'r1', time: 10, service: 'payer'}));
    t.same(
        index.trace('tr-1').map(node => node.id),
        ['r1'],
    );
    index.add(event({id: 'r1', time: 20, service: 'hub'}));
    const listing = index.trace('tr-1');
    t.equal(listing.length, 1, 'the redelivery replaced the record rather than joining it');
    t.equal(listing[0].service, 'hub', 'and the listing carries the newest delivery');
    t.equal(listing[0].time, 20, 'including the time it was redelivered at');
    t.same(
        index.chain('r1').map(node => node.id),
        ['r1'],
        'the walk still sees one node',
    );
    t.end();
});

t.test('replacing one record among several leaves the others untouched', t => {
    const index = new LineageIndex();
    index.add(event({id: 'a1', time: 10, service: 'payer'}));
    index.add(event({id: 'a2', time: 20, service: 'hub'}));
    index.add(event({id: 'a1', time: 30, service: 'payee'}));
    t.same(
        index.trace('tr-1').map(node => [node.id, node.service]),
        [
            ['a2', 'hub'],
            ['a1', 'payee'],
        ],
        'the untouched record stayed and the replacement took its place in time order',
    );
    t.end();
});

t.test('a re-add under another trace moves the record; it is not listed under both', t => {
    const index = new LineageIndex();
    index.add(event({id: 'm1', time: 10, refs: {record: 'm1', trace: 'tr-a'}}));
    t.equal(index.traceCount(), 1, 'the record created one trace listing');
    index.add(event({id: 'm1', time: 20, refs: {record: 'm1', trace: 'tr-b'}}));
    t.same(
        index.trace('tr-a').map(node => node.id),
        [],
        'the trace it left no longer claims it',
    );
    t.same(
        index.trace('tr-b').map(node => node.id),
        ['m1'],
        'the trace it moved to does',
    );
    t.equal(index.traceCount(), 1, 'the emptied bucket was pruned rather than left behind');
    t.end();
});

t.test('a replaced record cannot keep reporting an intent it no longer carries', t => {
    const index = new LineageIndex();
    index.add(event({id: 's1', time: 10, intent: {name: 'User_Transfer'}}));
    index.add(event({id: 's1', time: 20}));
    t.same(index.intentsOf('tr-1'), [], 'the replaced intent went with the replaced node');
    t.end();
});

// --- retention (Plan 2 Task 10 must settle this before wiring the index in) ---

t.test('traceIds lists the retained traces, as a copy the caller cannot reorder', t => {
    const index = new LineageIndex();
    index.add(event({id: 't1', time: 1, refs: {record: 't1', trace: 'tr-1'}}));
    index.add(event({id: 't2', time: 2, refs: {record: 't2', trace: 'tr-2'}}));
    const ids = index.traceIds();
    t.same(ids, ['tr-1', 'tr-2'], 'every retained trace is listed, in insertion order');
    ids.length = 0;
    t.same(
        index.traceIds(),
        ['tr-1', 'tr-2'],
        'the returned array is a copy: emptying it did not remove a trace from the index',
    );
    t.equal(index.traceCount(), 2, 'the index survived the caller');
    t.end();
});

t.test('the index keeps at most traceLimit traces, evicting the least recently seen', t => {
    const index = new LineageIndex(2, 8);
    index.add(event({id: 'a1', time: 1, refs: {record: 'a1', trace: 'tr-a'}}));
    index.add(event({id: 'b1', time: 2, refs: {record: 'b1', trace: 'tr-b'}}));
    // Touching tr-a makes tr-b the least recently seen, so tr-b is the victim
    // even though it is not the oldest by the emitters' times.
    index.add(event({id: 'a2', time: 3, refs: {record: 'a2', trace: 'tr-a', parent: 'a1'}}));
    index.add(event({id: 'c1', time: 4, refs: {record: 'c1', trace: 'tr-c'}}));
    t.same(index.traceIds().sort(), ['tr-a', 'tr-c'], 'the least recently seen trace was evicted');
    t.equal(index.traceCount(), 2, 'the retained window holds the cap');
    t.equal(index.evictions(), 1, 'the eviction is counted, not silent');
    t.same(index.trace('tr-b'), [], 'the evicted trace no longer lists');
    t.same(index.chain('b1'), [], 'and its records left the walk index with it');
    t.equal(index.rootOf('b1'), undefined, 'so the record has no root to report');
    t.end();
});

t.test(
    'a trace keeps its most recently indexed records and counts the least recent it dropped',
    t => {
        const index = new LineageIndex(4, 2);
        index.add(event({id: 'r1', time: 1, refs: {record: 'r1', trace: 'tr-1'}}));
        index.add(event({id: 'r2', time: 2, refs: {record: 'r2', trace: 'tr-1', parent: 'r1'}}));
        index.add(event({id: 'r3', time: 3, refs: {record: 'r3', trace: 'tr-1', parent: 'r2'}}));
        t.same(
            index.trace('tr-1').map(node => node.id),
            ['r2', 'r3'],
            'the least recently indexed record was dropped, the newest kept',
        );
        t.equal(index.truncations(), 1, 'the truncation is counted, not silent');
        t.same(
            index.chain('r3').map(node => node.id),
            ['r2', 'r3'],
            'the chain is truncated at the closest surviving ancestor rather than reaching the real root',
        );
        t.equal(
            index.rootOf('r3'),
            'r2',
            'so rootOf names a record closer to the leaf than the true origin',
        );
        t.end();
    },
);

t.test(
    'a backdated arrival is kept: the record cap drops by arrival, not by the emitter clock',
    t => {
        const index = new LineageIndex(4, 2);
        index.add(event({id: 'r1', time: 100, refs: {record: 'r1', trace: 'tr-1'}}));
        index.add(event({id: 'r2', time: 200, refs: {record: 'r2', trace: 'tr-1', parent: 'r1'}}));
        // A record arrives whose time is the *smallest* in the bucket. A cap ordered
        // by the emitter's clock would `shift` it out the instant it was indexed —
        // discarding the record correlation is about to read; one ordered by arrival
        // drops the record added longest ago instead.
        index.add(event({id: 'r3', time: 50, refs: {record: 'r3', trace: 'tr-1', parent: 'r2'}}));
        t.same(
            index.trace('tr-1').map(node => node.id),
            ['r3', 'r2'],
            'the backdated arrival survives; the record added longest ago is the one dropped',
        );
        t.equal(index.truncations(), 1, 'the truncation is still counted');
        t.equal(
            index.rootOf('r3'),
            'r2',
            'and the backdated record keeps its chain through the survivor',
        );
        t.end();
    },
);
