/**
 * Search and the deploy diff, both over declared identifiers.
 *
 * The ranking is lexical, so what is pinned is the property a reader relies on rather than a
 * number: a query that names part of an identifier finds it, the identifier outranks a message
 * that merely mentions the word, and a query that matches nothing returns nothing rather than
 * everything.
 */

import t from 'tap';
import {ExemplarStore} from './exemplars.ts';
import {SignalLedger, type IngestEvent} from './ledger.ts';
import {deployDiff, recordText, searchRecords, searchSignals, signalText} from './search.ts';

function observe(
    ledger: SignalLedger,
    signal: string,
    overrides: {time?: number; message?: string; service?: string} = {},
) {
    return ledger.upsert({
        id: `r-${signal}-${overrides.time ?? 0}`,
        time: overrides.time ?? 1000,
        signal,
        service: overrides.service ?? 'agent',
        ...(overrides.message === undefined ? {} : {message: overrides.message}),
    }).entry;
}

function record(overrides: Partial<IngestEvent> = {}): IngestEvent {
    return {
        id: overrides.id ?? 'r1',
        time: overrides.time ?? 1000,
        signal: overrides.signal ?? 'agentTicketSkipped',
        service: overrides.service ?? 'agent',
        msg: overrides.msg,
        message: overrides.message,
        ...overrides,
    };
}

void t.test('a signal is found by a token in its identifier', t => {
    const ledger = new SignalLedger();
    observe(ledger, 'agentTicketSkipped', {message: 'ticket was not claimed'});
    observe(ledger, 'agentSessionSuspended', {message: 'session suspended'});

    t.same(
        searchSignals(ledger, 'ticket').map(result => result.ref),
        ['agentTicketSkipped'],
    );
    t.end();
});

void t.test('an identifier outranks a message that merely mentions the word', t => {
    const ledger = new SignalLedger();
    observe(ledger, 'agentSessionSuspended', {message: 'the ticket was found suspended'});
    observe(ledger, 'agentTicketNotFound', {message: 'nothing matched'});

    const ranked = searchSignals(ledger, 'ticket');
    t.same(
        ranked.map(result => result.ref),
        ['agentTicketNotFound', 'agentSessionSuspended'],
        'the declared name comes first',
    );
    t.ok(
        (ranked[0]?.score ?? 0) > (ranked[1]?.score ?? 0),
        'and its score is higher, not merely equal',
    );
    t.end();
});

void t.test('a multi-word query scans by token, not by phrase', t => {
    const ledger = new SignalLedger();
    observe(ledger, 'agentTicketSkipped');
    t.equal(searchSignals(ledger, 'skipped ticket')[0]?.ref, 'agentTicketSkipped');
    t.equal(
        searchSignals(ledger, 'TICKET')[0]?.ref,
        'agentTicketSkipped',
        'and case is irrelevant',
    );
    t.end();
});

void t.test('a query that matches nothing returns nothing', t => {
    const ledger = new SignalLedger();
    observe(ledger, 'agentTicketSkipped');
    t.same(searchSignals(ledger, 'purpose'), [], 'rather than padding the ranking with zeroes');
    t.same(searchSignals(ledger, '   '), [], 'and a query with no token asks nothing');
    t.end();
});

void t.test('the ranking is bounded and deterministic', t => {
    const ledger = new SignalLedger();
    observe(ledger, 'bSignal');
    observe(ledger, 'aSignal');
    observe(ledger, 'cSignal');
    t.same(
        searchSignals(ledger, 'signal', 2).map(result => result.ref),
        ['aSignal', 'bSignal'],
        'the limit applies, and equal scores settle by reference',
    );
    t.end();
});

void t.test('a record is found by what it says', t => {
    const exemplars = new ExemplarStore({limit: 5});
    exemplars.offer(
        'agentTicketSkipped',
        record({id: 'r1', message: 'ticket t-1 was not claimed'}),
    );
    exemplars.offer('dbQuery', record({id: 'r2', signal: 'dbQuery', message: 'query took 900ms'}));

    t.same(
        searchRecords(exemplars, 'claimed').map(result => result.id),
        ['r1'],
    );
    t.equal(searchRecords(exemplars, 'nothing')[0], undefined);
    t.end();
});

void t.test('a record with no message is still found by its identifier', t => {
    const exemplars = new ExemplarStore({limit: 5});
    exemplars.offer('agentTicketSkipped', record({id: 'r1'}));
    t.equal(searchRecords(exemplars, 'agentTicketSkipped')[0]?.id, 'r1');
    t.end();
});

void t.test('the searchable text names the identifier, the message and the service', t => {
    t.equal(
        recordText(record({signal: 'a', message: 'm', service: 's'})),
        'a m s',
        'each part once, in the order a reader reads it',
    );
    t.equal(
        recordText({id: 'r', time: 1, signal: 'onlyAnId', service: 's'}),
        'onlyAnId s',
        'and a record with no message falls back to the parts it has',
    );
    t.equal(
        signalText({
            ref: 'a',
            message: 'm',
            service: 's',
            count: 1,
            firstSeen: 0,
            lastSeen: 0,
            exemplars: [],
            intents: [],
            declared: true,
        }),
        'a m s',
    );
    t.end();
});

void t.test('the deploy diff reports what a release changed', t => {
    const ledger = new SignalLedger();
    observe(ledger, 'ongoing', {time: 100});
    observe(ledger, 'ongoing', {time: 250});
    observe(ledger, 'added', {time: 250});
    observe(ledger, 'goneEarly', {time: 50});

    const diff = deployDiff(ledger, {from: 200, to: 300});
    t.same(
        diff.added.map(entry => entry.ref),
        ['added'],
        'first seen inside the window',
    );
    t.same(
        diff.removed.map(entry => entry.ref),
        ['goneEarly'],
        'last seen before it, so it stopped appearing',
    );
    t.equal(diff.unchanged, 1, 'and `ongoing` is neither: seen before the window and inside it');
    t.end();
});

void t.test('a retirement inside the window reads as removed', t => {
    const ledger = new SignalLedger();
    // Seen before the window and inside it, so neither `added` nor the `lastSeen` clause claims it:
    // the retirement is the only reason it is reported as gone.
    observe(ledger, 'retired', {time: 100});
    observe(ledger, 'retired', {time: 250});
    ledger.retire('retired', 250);

    t.same(
        deployDiff(ledger, {from: 200, to: 300}).removed.map(entry => entry.ref),
        ['retired'],
        'a signal retired inside the window is reported as gone',
    );
    t.end();
});

void t.test('a signal not seen inside the window is removed whether or not it was retired', t => {
    // The `lastSeen < from` clause is a statement about *this* window’s start, so an entry that
    // stopped appearing before it is gone from the diff’s point of view regardless of
    // `retiredAt` — the bucket answers “what is not being observed now”, not “what was retired”.
    const ledger = new SignalLedger();
    observe(ledger, 'quiet', {time: 100});
    observe(ledger, 'quietRetired', {time: 100});
    ledger.retire('quietRetired', 350);

    t.same(
        deployDiff(ledger, {from: 200, to: 300}).removed.map(entry => entry.ref),
        ['quiet', 'quietRetired'],
    );
    t.same(
        deployDiff(ledger, {from: 300, to: 400}).removed.map(entry => entry.ref),
        ['quiet', 'quietRetired'],
        'and a retirement after the window is reported by the window it happened in, not this one',
    );
    t.end();
});

void t.test('observing a retired signal again takes it out of the removed bucket', t => {
    const ledger = new SignalLedger();
    observe(ledger, 'back', {time: 100});
    ledger.retire('back', 200);
    observe(ledger, 'back', {time: 300});

    t.same(
        deployDiff(ledger, {from: 250, to: 350}).removed.map(entry => entry.ref),
        [],
        'a signal seen again is not gone',
    );
    t.equal(ledger.get('back')?.retiredAt, undefined, 'because the retirement was cleared');
    t.end();
});
