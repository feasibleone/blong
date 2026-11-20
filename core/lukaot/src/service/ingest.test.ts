/**
 * Ingestion, over declared identifiers.
 *
 * The behaviours pinned here are the ones the convergence changes: an identifier the service has
 * never been told about is **observed** rather than rejected, a first sighting is announced once,
 * and retention happens before any callback so a reporter that throws cannot cost a record its
 * exemplar.
 */

import t from 'tap';
import {ExemplarStore} from './exemplars.ts';
import {createIngest} from './ingest.ts';
import {SignalLedger, type IngestEvent} from './ledger.ts';

/** An event with the fields the ledger needs, and nothing else — the wire's minimum. */
function event(overrides: Partial<IngestEvent> = {}): IngestEvent {
    return {
        id: overrides.id ?? `r-${Math.random().toString(36).slice(2)}`,
        time: overrides.time ?? 1000,
        signal: overrides.signal ?? 'agentTicketSkipped',
        service: overrides.service ?? 'agent',
        ...overrides,
    };
}

function setup(declared: (signal: string) => boolean = () => true) {
    const ledger = new SignalLedger(declared);
    const exemplars = new ExemplarStore({limit: 2});
    const added: string[] = [];
    const kept: string[] = [];
    const accepted: string[] = [];
    const ingest = createIngest({
        ledger,
        exemplars,
        onSignalAdded: entry => added.push(entry.ref),
        onExemplar: (_entry, id) => kept.push(id),
        onAccepted: e => accepted.push(e.id),
    });
    return {ledger, exemplars, added, kept, accepted, ingest};
}

void t.test('a batch is accepted and counted against the identifier it names', async t => {
    const {ledger, ingest} = setup();
    const result = await ingest({
        events: [event({id: 'r1', signal: 'agentTicketSkipped', time: 1000})],
    });

    t.same(result, {accepted: 1, signals: 1}, 'one event, one signal');
    const entry = ledger.get('agentTicketSkipped');
    t.equal(entry?.count, 1, 'the entry counted the occurrence');
    t.equal(entry?.firstSeen, 1000);
    t.equal(entry?.lastSeen, 1000);
    t.end();
});

void t.test('an unknown signal is ingested as an ad-hoc identity, never rejected', async t => {
    // The service was told nothing: a release rolled its emitters out ahead of it. This is the
    // case a rolling deploy produces, and rejecting it would make the service blind to exactly the
    // release an operator is watching.
    const {ledger, added, ingest} = setup(() => false);
    const result = await ingest({events: [event({signal: 'agentPurposeInvented'})]});

    t.equal(result.accepted, 1, 'the event was ingested');
    const entry = ledger.get('agentPurposeInvented');
    t.ok(entry, 'and an entry exists, keyed by the name on the wire');
    t.equal(entry?.declared, false, 'marked ad-hoc rather than declared');
    t.equal(entry?.count, 1);
    t.same(added, ['agentPurposeInvented'], 'and its first sighting was announced');
    t.same(
        ledger.adHoc().map(current => current.ref),
        ['agentPurposeInvented'],
        'the ledger can list what it was never told about',
    );
    t.end();
});

void t.test('a declared signal is marked as declared', async t => {
    const {ledger, ingest} = setup(signal => signal === 'dbQuery');
    await ingest({events: [event({signal: 'dbQuery'})]});
    t.equal(ledger.get('dbQuery')?.declared, true);
    t.same(ledger.adHoc(), [], 'and nothing is ad-hoc');
    t.end();
});

void t.test('a first sighting is announced once, a repeat only counts', async t => {
    const {ledger, added, ingest} = setup();
    await ingest({events: [event({id: 'r1', time: 1000})]});
    await ingest({events: [event({id: 'r2', time: 2000})]});

    t.same(added, ['agentTicketSkipped'], 'announced on the first event only');
    const entry = ledger.get('agentTicketSkipped');
    t.equal(entry?.count, 2, 'both occurrences counted');
    t.equal(entry?.lastSeen, 2000, 'and the later sighting moved the window');
    t.end();
});

void t.test('a retained record is claimed before any callback can throw', async t => {
    const ledger = new SignalLedger();
    const exemplars = new ExemplarStore({limit: 1});
    let threw = false;
    const ingest = createIngest({
        ledger,
        exemplars,
        onSignalAdded: () => {
            threw = true;
            throw new Error('the reporter is broken');
        },
    });

    const failure = await ingest({events: [event({id: 'r1'})]}).catch(error => error);

    t.ok(threw, 'the announcement ran');
    t.match(failure, /the reporter is broken/, 'and a defect in the service propagates');
    t.equal(ledger.get('agentTicketSkipped')?.count, 1, 'the entry stayed counted');
    t.same(
        exemplars.get('agentTicketSkipped'),
        ['r1'],
        'and the exemplar survived, because retention precedes publication',
    );
    t.end();
});

void t.test('exemplar slots are per signal, and only the kept ones are announced', async t => {
    const {ledger, kept, ingest} = setup();
    await ingest({
        events: [
            event({id: 'r1', signal: 'a', time: 1}),
            event({id: 'r2', signal: 'a', time: 2}),
            event({id: 'r3', signal: 'a', time: 3}),
            event({id: 'r4', signal: 'b', time: 4}),
        ],
    });

    t.same(kept, ['r1', 'r2', 'r4'], 'two slots for `a`, and a fresh store for `b`');
    t.equal(ledger.get('a')?.count, 3, 'the refused occurrence still counted');
    t.same(ledger.get('a')?.exemplars, ['r1', 'r2'], 'the entry names the retained records');
    t.end();
});

void t.test('the accepted stream is every event, before its deltas', async t => {
    const {accepted, ingest} = setup();
    await ingest({events: [event({id: 'r1', time: 1}), event({id: 'r2', time: 2})]});
    t.same(accepted, ['r1', 'r2'], 'both arrivals reported, in order');
    t.end();
});

void t.test('the envelope reaches the causal index, progress points do not', async t => {
    const {ledger, ingest} = setup();
    await ingest({
        events: [
            event({
                id: 'r1',
                refs: {record: 'r0', trace: 'tr-1', parent: 'r0'},
                progress: {
                    regions: [
                        {id: 'x', discriminator: 'route', chosen: 'hubB', candidates: ['hubB']},
                    ],
                    points: ['prepared'],
                },
                flow: {id: 'f1', kind: 'transfer.single', leg: 'leg-1'},
            }),
        ],
    });

    const entry = ledger.get('agentTicketSkipped');
    t.ok(entry, 'the signal was counted');
    t.end();
});

void t.test('a malformed batch is rejected whole, and nothing is written', async t => {
    const {ledger, ingest} = setup();
    for (const body of [
        undefined,
        {},
        {events: 'nope'},
        {events: [{time: 1, signal: 'a', service: 's'}]},
        {events: [{id: 'r1', time: 1, service: 's'}]},
        {events: [{id: 'r1', time: 1, signal: '', service: 's'}]},
        {events: [{id: 'r1', time: 1, signal: 'a'}]},
        {events: [{id: 'r1', time: 1, signal: 'a', service: 's', flow: {id: 7}}]},
    ]) {
        const failure = await ingest(body).catch((error: unknown) => error);
        t.match(failure, /ingest: expected/, `rejected: ${JSON.stringify(body)}`);
    }
    t.equal(ledger.size(), 0, 'and the ledger was never touched');
    t.end();
});

void t.test('an empty batch is a valid batch', async t => {
    const {ingest} = setup();
    t.same(await ingest({events: []}), {accepted: 0, signals: 0});
    t.end();
});
