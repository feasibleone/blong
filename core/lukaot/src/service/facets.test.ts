/**
 * Facet projection: one stored signal, three audiences.
 *
 * What is pinned is the promise R16 makes — a view costs no emitter change — and the two things a
 * projection must never do: leak a mutable reference into the ledger, and answer a question the
 * service cannot honestly answer. The second is why `diagnostic` reports `declared` rather than
 * anything the dropped detectors used to guess at.
 */

import t from 'tap';
import {FACETS, isFacet, project} from './facets.ts';
import type {SignalEntry} from './ledger.ts';

const entry: SignalEntry = {
    ref: 'agentTicketSkipped',
    message: 'ticket {ticketId} was not claimed',
    service: 'agent',
    level: 30,
    levelName: 'warn',
    count: 7,
    firstSeen: 100,
    lastSeen: 300,
    exemplars: ['r1'],
    intents: ['ticket.pool'],
    declared: true,
};

void t.test('the facet list is the three audiences, and only those are asked for', t => {
    t.same(FACETS, ['ops', 'diagnostic', 'compliance']);
    t.ok(isFacet('ops'));
    t.notOk(isFacet('all'), 'so a caller cannot ask for a projection nothing implements');
    t.end();
});

void t.test('ops reports the counters a dashboard reads', t => {
    t.same(project(entry, 'ops'), {
        ref: 'agentTicketSkipped',
        service: 'agent',
        levelName: 'warn',
        count: 7,
        firstSeen: 100,
        lastSeen: 300,
        retiredAt: undefined,
        message: 'ticket {ticketId} was not claimed',
    });
    t.end();
});

void t.test('diagnostic says what the signal is, and whether it was declared', t => {
    t.same(project(entry, 'diagnostic'), {
        ref: 'agentTicketSkipped',
        service: 'agent',
        levelName: 'warn',
        signal: 'agentTicketSkipped',
        declared: true,
        message: 'ticket {ticketId} was not claimed',
        level: 30,
    });
    t.equal(
        project({...entry, declared: false}, 'diagnostic').declared,
        false,
        'an ad-hoc signal says so, which is the interesting diagnostic case',
    );
    t.end();
});

void t.test('compliance hands out copies, so a view cannot edit the ledger', t => {
    const view = project(entry, 'compliance') as {intents: string[]; exemplars: string[]};
    view.intents.push('injected');
    view.exemplars.push('r2');

    t.same(entry.intents, ['ticket.pool'], 'the entry kept its own list');
    t.same(entry.exemplars, ['r1']);
    t.end();
});

void t.test('every facet carries the identity and the service', t => {
    for (const facet of FACETS) {
        const view = project(entry, facet);
        t.equal(view.ref, 'agentTicketSkipped', `${facet} names the signal`);
        t.equal(view.service, 'agent', `${facet} names the service`);
    }
    t.end();
});
