/**
 * The ledger: what the service observed, keyed by the declared identifier.
 *
 * This is the file the convergence changes, so what is pinned here is the identity itself — one
 * entry per identifier, a repeat incrementing rather than creating, an identifier never seen before
 * becoming an ad-hoc entry, and the wire being read tolerantly from a peer that is out of step.
 */

import t from 'tap';
import {legOf, progressOf, SignalLedger, type IngestEvent} from './ledger.ts';

function event(overrides: Partial<IngestEvent> = {}): IngestEvent {
    return {
        id: overrides.id ?? 'r1',
        time: overrides.time ?? 1000,
        signal: overrides.signal ?? 'agentTicketSkipped',
        service: overrides.service ?? 'agent',
        ...overrides,
    };
}

void t.test('the identifier is the key: a repeat counts, it does not create', t => {
    const ledger = new SignalLedger();
    const first = ledger.upsert(event({id: 'r1', time: 100}));
    const second = ledger.upsert(event({id: 'r2', time: 200}));

    t.equal(first.novel, true, 'the first sighting is novel');
    t.equal(second.novel, false, 'and the second is not');
    t.equal(ledger.size(), 1, 'one identifier, one entry whatever the spelling of the record');
    t.equal(second.entry.count, 2);
    t.equal(second.entry.firstSeen, 100, 'the window starts where it started');
    t.equal(second.entry.lastSeen, 200, 'and ends at the later sighting');
    t.end();
});

void t.test('a reworded message is the same signal, and the latest wording is kept', t => {
    const ledger = new SignalLedger();
    ledger.upsert(event({message: 'ticket was not claimed'}));
    ledger.upsert(event({message: 'ticket could not be claimed'}));

    t.equal(ledger.size(), 1, 'the identity does not depend on the text');
    t.equal(
        ledger.get('agentTicketSkipped')?.message,
        'ticket could not be claimed',
        'and the current wording is what a reader is shown',
    );
    t.end();
});

void t.test('an earlier sighting never moves the window backwards', t => {
    const ledger = new SignalLedger();
    ledger.upsert(event({time: 200}));
    ledger.upsert(event({time: 100}));
    t.equal(
        ledger.get('agentTicketSkipped')?.lastSeen,
        200,
        'a straggler does not rewind lastSeen',
    );
    t.equal(ledger.get('agentTicketSkipped')?.firstSeen, 200, 'nor does it move firstSeen');
    t.end();
});

void t.test('a signal seen again after retirement is back', t => {
    const ledger = new SignalLedger();
    ledger.upsert(event({time: 100}));
    ledger.retire('agentTicketSkipped', 150);
    t.equal(ledger.get('agentTicketSkipped')?.retiredAt, 150, 'retired');

    ledger.upsert(event({time: 149}));
    t.equal(
        ledger.get('agentTicketSkipped')?.retiredAt,
        150,
        'a straggler from before the retirement does not resurrect it',
    );

    ledger.upsert(event({time: 150}));
    t.equal(
        ledger.get('agentTicketSkipped')?.retiredAt,
        undefined,
        'but a sighting at or after the retirement does',
    );
    t.end();
});

void t.test('bump counts an occurrence the caller already attributed', t => {
    const ledger = new SignalLedger();
    t.equal(ledger.bump('unknown', 100), undefined, 'an unknown reference answers nothing');
    ledger.upsert(event({time: 100}));
    const bumped = ledger.bump('agentTicketSkipped', 300);
    t.equal(bumped?.count, 2);
    t.equal(bumped?.lastSeen, 300);
    t.equal(ledger.bump('agentTicketSkipped', 250)?.lastSeen, 300, 'and never rewinds');
    t.end();
});

void t.test('a restored ledger replaces what it held', t => {
    const ledger = new SignalLedger(signal => signal === 'declared');
    ledger.upsert(event({signal: 'old'}));
    ledger.replaceAll([
        {
            ref: 'declared',
            service: 'agent',
            count: 4,
            firstSeen: 10,
            lastSeen: 20,
            exemplars: [],
            intents: [],
            declared: true,
        },
    ]);

    t.equal(ledger.size(), 1);
    t.equal(ledger.get('old'), undefined, 'what was there is gone');
    t.equal(ledger.get('declared')?.count, 4, 'and the snapshot is what the ledger holds');
    t.end();
});

void t.test('intent names are collected once each', t => {
    const ledger = new SignalLedger();
    ledger.upsert(event({intent: {name: 'ticket.pool'}}));
    ledger.upsert(event({intent: {name: 'ticket.pool'}}));
    ledger.upsert(event({intent: {name: 'ticket.retry'}}));
    t.same(ledger.get('agentTicketSkipped')?.intents, ['ticket.pool', 'ticket.retry']);
    t.end();
});

void t.test('an identifier the service was never told about is ad-hoc', t => {
    const ledger = new SignalLedger();
    ledger.upsert(event({signal: 'brandNew'}));
    t.equal(ledger.get('brandNew')?.declared, false);
    t.same(
        ledger.adHoc().map(entry => entry.ref),
        ['brandNew'],
    );
    t.end();
});

void t.test('progress marks are rebuilt, or dropped whole when the grammar rejects them', t => {
    const full = progressOf(
        event({
            progress: {
                regions: [
                    {id: 'x', discriminator: 'route', chosen: 'hubB', candidates: ['hubA', 'hubB']},
                    {id: 'y', discriminator: '', chosen: 'z', candidates: []},
                    {id: 'z', discriminator: 'r', chosen: '', candidates: []},
                ],
                points: ['prepared', ''],
            },
        }),
    );
    t.same(
        full?.regions.map(mark => mark.id),
        ['x'],
        'a mark with no discriminator or no choice is dropped',
    );
    t.same(full?.points, ['prepared'], 'and a point with no text is not a note');

    const collapsed = progressOf(
        event({
            progress: {
                regions: [
                    {
                        id: 'x',
                        discriminator: 'route',
                        chosen: 'hubB',
                        candidates: undefined as unknown as string[],
                    },
                ],
            },
        }),
    );
    t.same(
        collapsed?.regions[0]?.candidates,
        ['hubB'],
        'a candidate list that did not arrive degrades to the branch that ran',
    );

    const counted = progressOf(
        event({
            progress: {
                regions: [
                    {
                        id: 'x',
                        discriminator: 'route',
                        chosen: 'hubB',
                        candidates: ['hubB'],
                        pointsBefore: 2.7,
                    },
                ],
            },
        }),
    );
    t.equal(
        counted?.regions[0]?.pointsBefore,
        2,
        'the count that preceded the decision travels, truncated',
    );

    t.equal(progressOf(event()), undefined, 'and no progress at all is not an empty one');
    t.equal(
        progressOf(event({progress: {points: []}})),
        undefined,
        'nor is a mark list that says nothing',
    );
    t.end();
});

void t.test('a leg is read only when the wire carries a usable one', t => {
    const usable = legOf(
        event({
            flow: {id: 'f1', leg: 'leg-1', legFrom: 'a', legTo: 'b', legSeq: '1.2'},
        }),
    );
    t.equal(usable?.id, 'leg-1');
    t.equal(usable?.from, 'a');
    t.equal(usable?.to, 'b');
    t.equal(usable?.seq, '1.2');

    const unusable = legOf(
        event({flow: {id: 'f1', leg: 'not a leg!', legFrom: 'a b', legTo: '', legSeq: 'nope'}}),
    );
    t.equal(
        unusable,
        undefined,
        'an unbalanced peer cannot put a value into a shape that cannot carry it',
    );
    t.equal(legOf(event()), undefined, 'and no flow means no leg');
    t.end();
});
