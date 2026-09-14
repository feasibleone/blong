import t from 'tap';
import {FACETS, isFacet, project} from './facets.ts';
import type {TemplateEntry} from './registry.ts';

const entry: TemplateEntry = {
    ref: 'ffff0000ffff',
    fingerprint: 'ffff0000ffff0000ffff0000ffff0000',
    signature: '[LEVEL: ERROR] [SERVICE: payer] [MSG: transfer 42 rejected]',
    service: 'payer',
    level: 50,
    levelName: 'error',
    count: 91,
    firstSeen: 1000,
    lastSeen: 9000,
    exemplars: ['01A', '01B'],
    alerts: {noveltyAt: 1000},
    intents: ['User_Transfer'],
};

t.test('every facet is a projection of the same stored entry', t => {
    const ops = project(entry, 'ops');
    const diagnostic = project(entry, 'diagnostic');
    const compliance = project(entry, 'compliance');
    t.equal(ops.ref, diagnostic.ref);
    t.equal(diagnostic.ref, compliance.ref);
    t.notOk(ops === diagnostic, 'each audience gets its own projection, not a shared one');
    t.end();
});

t.test('ops reports volume and recency, not internals', t => {
    const ops = project(entry, 'ops');
    t.equal(ops.count, 91);
    t.equal(ops.lastSeen, 9000);
    t.equal(ops.message, 'transfer 42 rejected', 'the signature is reduced to the operator-facing message');
    t.notOk('fingerprint' in ops, 'an operator does not need the hash');
    t.notOk('signature' in ops, 'nor the raw signature');
    t.end();
});

t.test('diagnostic reports the identity needed to group and compare', t => {
    const diagnostic = project(entry, 'diagnostic');
    t.equal(diagnostic.fingerprint, entry.fingerprint);
    t.equal(diagnostic.signature, entry.signature);
    t.equal(diagnostic.novelty, true, 'the novelty stamp is readable as a boolean');
    t.end();
});

t.test('drifted means implicated in a flow drift, not that the template drifted', t => {
    // RULED 2026-09-13 (decision.md): a template's vector is constant, so it can
    // never drift (D4, R6c). `drifted` reports that this template's event
    // *triggered* a drift observation, which the caller learns from the anomaly
    // collection it supplies.
    t.equal(project(entry, 'diagnostic').drifted, false, 'no retained anomaly implicates it');
    t.equal(
        project(entry, 'diagnostic', [{kind: 'drift', templateRef: entry.ref}]).drifted,
        true,
        'a drift anomaly naming this template as its trigger makes it true',
    );
    t.equal(
        project(entry, 'diagnostic', [{kind: 'drift', templateRef: '0000ffff0000'}]).drifted,
        false,
        'a drift observed on another template does not implicate this one',
    );
    t.equal(
        project(entry, 'diagnostic', [{kind: 'novelty', templateRef: entry.ref}]).drifted,
        false,
        'an anomaly that merely names this template is not a drift',
    );
    t.end();
});

t.test('compliance reports intent, services and the exemplar trail', t => {
    const compliance = project(entry, 'compliance');
    t.same(compliance.intents, ['User_Transfer']);
    t.same(compliance.exemplars, ['01A', '01B']);
    t.equal(compliance.service, 'payer');
    t.end();
});

t.test('a facet hands back copies, never the registry entry own state', t => {
    const diagnostic = project(entry, 'diagnostic');
    const compliance = project(entry, 'compliance');
    t.notOk(compliance.intents === entry.intents, 'the intents array is a copy');
    t.notOk(compliance.exemplars === entry.exemplars, 'the exemplar trail is a copy');
    t.notOk(diagnostic.alerts === entry.alerts, 'the alert bookkeeping is a copy');
    (compliance.intents as string[]).push('Mutated_By_Caller');
    (compliance.exemplars as string[]).push('FFFF');
    (diagnostic.alerts as {noveltyAt?: number}).noveltyAt = 0;
    t.same(entry.intents, ['User_Transfer'], 'editing a projection cannot change the entry');
    t.same(entry.exemplars, ['01A', '01B']);
    t.equal(entry.alerts.noveltyAt, 1000);
    t.end();
});

t.test('the facet list is the contract', t => {
    t.same([...FACETS], ['ops', 'diagnostic', 'compliance']);
    t.ok(isFacet('ops'));
    t.notOk(isFacet('finance'), 'an unknown facet is recognised as unknown, not coerced');
    t.end();
});
