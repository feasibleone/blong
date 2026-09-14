import t from 'tap';
import {IncidentStore, correlate} from './incidents.ts';
import {LineageIndex} from './lineage.ts';
import {TemplateRegistry} from './registry.ts';
import type {Anomaly} from './detectors.ts';

function lineage(): LineageIndex {
    const index = new LineageIndex();
    index.add({id: 'payer-1', time: 10, fingerprint: 'fp-payer', service: 'payer', refs: {record: 'payer-1', trace: 'tr-1'}});
    index.add({id: 'hub-1', time: 20, fingerprint: 'fp-hub', service: 'hub', refs: {record: 'hub-1', trace: 'tr-1', parent: 'payer-1'}});
    index.add({id: 'payee-1', time: 30, fingerprint: 'fp-payee', service: 'payee', refs: {record: 'payee-1', trace: 'tr-1', parent: 'hub-1'}});
    return index;
}

function registry(): TemplateRegistry {
    const reg = new TemplateRegistry();
    for (const [fp, service] of [['fp-payer', 'payer'], ['fp-hub', 'hub'], ['fp-payee', 'payee']] as const) {
        reg.upsert({id: `id-${fp}`, time: 1, fingerprint: fp, service, template: `[MSG: ${service}]`});
    }
    return reg;
}

t.test('anomalies across services on one trace become ONE incident (PRD R15)', t => {
    const anomalies: Anomaly[] = [
        {kind: 'novelty', ref: 'fp-payee', time: 30},
        {kind: 'novelty', ref: 'fp-hub', time: 20},
        {kind: 'novelty', ref: 'fp-payer', time: 10},
    ];
    const incidents = correlate(anomalies, lineage(), registry(), 60_000);
    t.equal(incidents.length, 1, 'not one alert per service');
    t.equal(incidents[0].services.length, 3);
    t.equal(incidents[0].rootCause, 'payer-1', 'ranked by position in the causal chain');
    t.equal(incidents[0].firstAt, 10);
    t.end();
});

t.test('anomalies on different traces stay separate', t => {
    const index = lineage();
    index.add({id: 'other-1', time: 15, fingerprint: 'fp-payee', service: 'payee', refs: {record: 'other-1', trace: 'tr-2'}});
    const incidents = correlate(
        [
            {kind: 'novelty', ref: 'fp-payee', time: 30},
            {kind: 'novelty', ref: 'fp-hub', time: 20},
        ],
        index,
        registry(),
        60_000,
    );
    t.equal(incidents.length, 1, 'the trace the anomaly was observed on wins, not every trace that shares the template');
    t.equal(incidents[0].trace, 'tr-1');
    t.end();
});

t.test('anomalies outside the window are not merged', t => {
    const index = new LineageIndex();
    index.add({id: 'a', time: 0, fingerprint: 'fp-x', service: 'hub', refs: {record: 'a', trace: 'tr-a'}});
    index.add({id: 'b', time: 500_000, fingerprint: 'fp-y', service: 'hub', refs: {record: 'b', trace: 'tr-b'}});
    const reg = new TemplateRegistry();
    reg.upsert({id: 'a', time: 0, fingerprint: 'fp-x', service: 'hub'});
    reg.upsert({id: 'b', time: 0, fingerprint: 'fp-y', service: 'hub'});
    const incidents = correlate(
        [{kind: 'novelty', ref: 'fp-x', time: 0}, {kind: 'novelty', ref: 'fp-y', time: 500_000}],
        index,
        reg,
        1000,
    );
    t.equal(incidents.length, 2, 'a window that does not overlap yields two incidents');
    t.end();
});

t.test('two bursts on ONE trace, farther apart than the window, are two incidents', t => {
    const index = new LineageIndex();
    index.add({id: 'early', time: 0, fingerprint: 'fp-x', service: 'hub', refs: {record: 'early', trace: 'tr-1'}});
    index.add({id: 'late', time: 500_000, fingerprint: 'fp-y', service: 'hub', refs: {record: 'late', trace: 'tr-1'}});
    const incidents = correlate(
        [{kind: 'novelty', ref: 'fp-x', time: 0}, {kind: 'novelty', ref: 'fp-y', time: 500_000}],
        index,
        registry(),
        1000,
    );
    t.equal(incidents.length, 2, 'the window splits one trace into separate incidents');
    t.same(
        incidents.map(incident => incident.trace),
        ['tr-1', 'tr-1'],
        'and both carry the trace',
    );
    t.end();
});

t.test('severity reflects how many services and anomaly kinds are involved', t => {
    const incidents = correlate(
        [
            {kind: 'novelty', ref: 'fp-payee', time: 30},
            {kind: 'drift', ref: 'fp-hub', time: 20},
            {kind: 'rate-shift', ref: 'fp-payer', time: 10},
        ],
        lineage(),
        registry(),
        60_000,
    );
    t.equal(incidents[0].kinds.length, 3);
    t.ok(incidents[0].severity >= 3);
    t.end();
});

t.test('an anomaly already nearest the root does not have its root replaced by a deeper one', t => {
    // The anomalies arrive root-first, so the deeper chain is compared against a
    // closer-to-root candidate and must lose. The other order is in the first test.
    const incidents = correlate(
        [
            {kind: 'novelty', ref: 'fp-payer', time: 10},
            {kind: 'novelty', ref: 'fp-payee', time: 30},
        ],
        lineage(),
        registry(),
        60_000,
    );
    t.equal(incidents[0].rootCause, 'payer-1');
    t.end();
});

t.test('an anomaly no retained record matches is grouped as untraced, not dropped', t => {
    const index = lineage();
    const incidents = correlate([{kind: 'novelty', ref: 'fp-unknown', time: 10}], index, registry(), 60_000);
    t.equal(incidents.length, 1, 'the anomaly is reported');
    t.equal(incidents[0].trace, 'untraced:fp-unknown', 'under its own key rather than a fabricated trace');
    t.equal(incidents[0].rootCause, 'fp-unknown', 'with no chain to rank it holds its own reference');
    t.equal(incidents[0].services.length, 0, 'and a reference the registry never saw names no service');
    t.equal(incidents[0].severity, 1, 'severity still counts the kind');
    t.end();
});

t.test('a traced anomaly whose template left the registry still correlates', t => {
    const index = new LineageIndex();
    index.add({id: 'only', time: 5, fingerprint: 'fp-gone', service: 'hub', refs: {record: 'only', trace: 'tr-9'}});
    const incidents = correlate([{kind: 'rate-shift', ref: 'fp-gone', time: 5}], index, new TemplateRegistry(), 60_000);
    t.equal(incidents.length, 1);
    t.equal(incidents[0].trace, 'tr-9');
    t.same(incidents[0].services, [], 'a template with no entry names no service');
    t.equal(incidents[0].rootCause, 'only');
    t.end();
});

t.test('no anomalies means no incidents', t => {
    t.same(correlate([], lineage(), registry(), 60_000), []);
    t.end();
});

// --- the accumulator -------------------------------------------------------

t.test('the store accumulates one incident across batches, and only reports change', t => {
    const store = new IncidentStore();
    const index = lineage();
    const reg = registry();

    const first = store.absorb(
        [
            {kind: 'novelty', ref: 'fp-payer', time: 10},
            {kind: 'novelty', ref: 'fp-hub', time: 20},
        ],
        index,
        reg,
        60_000,
    );
    t.equal(first.length, 1, 'the first batch opens the incident');
    t.equal(first[0].services.length, 2, 'with only what that batch knew');

    const second = store.absorb([{kind: 'novelty', ref: 'fp-payee', time: 30}], index, reg, 60_000);
    t.equal(second.length, 1, 'a later batch grows the same incident');
    t.equal(second[0].id, first[0].id, 'under one identity');
    t.equal(second[0].services.length, 3, 'and the digest sees the richer incident, not the first snapshot');

    t.same(store.absorb([], index, reg, 60_000), [], 'an unchanged correlation is not republished');
    t.equal(store.list().length, 1, 'while the retained incident is still readable');
    t.end();
});

t.test('an out-of-order anomaly grows the same incident instead of opening a second one', t => {
    const store = new IncidentStore();
    const index = lineage();
    const reg = registry();
    const first = store.absorb(
        [
            {kind: 'novelty', ref: 'fp-payer', time: 200},
            {kind: 'novelty', ref: 'fp-hub', time: 200},
        ],
        index,
        reg,
        60_000,
    );
    t.equal(first.length, 1, 'two anomalies open the incident');
    t.equal(first[0].firstAt, 200);
    // A later batch carries an anomaly with an *earlier* timestamp: the emitters'
    // clocks are not comparable, so the group's running minimum moves *down*. An
    // id derived from that minimum would name a second incident for one burst.
    const second = store.absorb([{kind: 'novelty', ref: 'fp-payee', time: 150}], index, reg, 60_000);
    t.equal(second.length, 1, 'the late anomaly joins the incident and is reported');
    t.equal(second[0].id, first[0].id, 'under the identity it grew from, not a fresh one');
    t.equal(second[0].firstAt, 150, 'and the incident now reaches the earlier anomaly');
    t.equal(store.list().length, 1, 'one trace, one incident — not two entries for one burst');
    t.end();
});

t.test('a backdated record that just arrived can still anchor its anomaly', t => {
    // The record cap drops the least recently indexed record, so a backdated
    // arrival survives. Under a cap ordered by the emitter's clock it would be
    // `shift`ed out immediately and its anomaly would resolve to `untraced`.
    const index = new LineageIndex(4, 2);
    index.add({id: 'old', time: 100, fingerprint: 'fp-old', service: 'hub', refs: {record: 'old', trace: 'tr-1'}});
    index.add({id: 'newer', time: 200, fingerprint: 'fp-newer', service: 'hub', refs: {record: 'newer', trace: 'tr-1', parent: 'old'}});
    index.add({id: 'back', time: 50, fingerprint: 'fp-back', service: 'payer', refs: {record: 'back', trace: 'tr-1', parent: 'newer'}});
    const reg = new TemplateRegistry();
    reg.upsert({id: 'b', time: 1, fingerprint: 'fp-back', service: 'payer'});
    reg.upsert({id: 'n', time: 1, fingerprint: 'fp-newer', service: 'hub'});
    const incidents = correlate(
        [
            {kind: 'novelty', ref: 'fp-back', time: 50},
            {kind: 'novelty', ref: 'fp-newer', time: 200},
        ],
        index,
        reg,
        60_000,
    );
    t.equal(incidents.length, 1, 'the backdated record kept its anomaly on the trace, so the two join');
    t.equal(incidents[0].trace, 'tr-1', 'rather than the backdated anomaly splitting off as untraced');
    t.end();
});

t.test('two anomalies from one service on one trace are one incident with a single service', t => {
    const index = new LineageIndex();
    index.add({id: 'solo-1', time: 10, fingerprint: 'fp-solo', service: 'hub', refs: {record: 'solo-1', trace: 'tr-solo'}});
    index.add({id: 'solo-2', time: 20, fingerprint: 'fp-solo-2', service: 'hub', refs: {record: 'solo-2', trace: 'tr-solo', parent: 'solo-1'}});
    const reg = new TemplateRegistry();
    reg.upsert({id: 's1', time: 1, fingerprint: 'fp-solo', service: 'hub'});
    reg.upsert({id: 's2', time: 1, fingerprint: 'fp-solo-2', service: 'hub'});
    const incidents = correlate(
        [
            {kind: 'novelty', ref: 'fp-solo', time: 10},
            {kind: 'rate-shift', ref: 'fp-solo-2', time: 20},
        ],
        index,
        reg,
        60_000,
    );
    t.equal(incidents.length, 1, 'two detectors on one trace correlate');
    t.same(incidents[0].services, ['hub'], 'even though only one service emitted both');
    t.equal(incidents[0].severity, 3, 'severity counts the one service and the two kinds');
    t.end();
});

t.test('the store hands out copies: a caller cannot mutate what it reports next time', t => {
    const store = new IncidentStore();
    const index = lineage();
    const reg = registry();
    const opened = store.absorb(
        [
            {kind: 'novelty', ref: 'fp-payer', time: 10},
            {kind: 'novelty', ref: 'fp-hub', time: 20},
        ],
        index,
        reg,
        60_000,
    );
    opened[0].refs.length = 0;
    t.same(store.list()[0].refs.sort(), ['fp-hub', 'fp-payer'], 'the absorb result is a copy');

    const listed = store.list();
    listed[0].services.length = 0;
    listed[0].anomalies.length = 0;
    listed[0].rootCause = 'tampered';
    const again = store.list();
    t.same(again[0].services, ['payer', 'hub'], 'the stored services survived the caller');
    t.equal(again[0].anomalies.length, 2, 'and so did the anomalies the signature is derived from');
    t.equal(again[0].rootCause, 'payer-1', 'and the origin');
    t.end();
});

t.test('a lone anomaly is not a correlation: nothing is retained or republished', t => {
    const store = new IncidentStore();
    t.same(
        store.absorb([{kind: 'novelty', ref: 'fp-payer', time: 10}], lineage(), registry(), 60_000),
        [],
        'one anomaly alone is already the anomaly delta, not an incident',
    );
    t.same(store.list(), [], 'and it is not retained either');
    t.end();
});

t.test('the store lists incidents newest first', t => {
    const store = new IncidentStore();
    const index = new LineageIndex();
    index.add({id: 'e1', time: 0, fingerprint: 'fp-a', service: 'hub', refs: {record: 'e1', trace: 'tr-a'}});
    index.add({id: 'e2', time: 1, fingerprint: 'fp-b', service: 'hub', refs: {record: 'e2', trace: 'tr-a'}});
    index.add({id: 'l1', time: 900_000, fingerprint: 'fp-c', service: 'hub', refs: {record: 'l1', trace: 'tr-b'}});
    index.add({id: 'l2', time: 900_001, fingerprint: 'fp-d', service: 'hub', refs: {record: 'l2', trace: 'tr-b'}});
    const reg = registry();
    store.absorb(
        [
            {kind: 'novelty', ref: 'fp-a', time: 0},
            {kind: 'novelty', ref: 'fp-b', time: 1},
        ],
        index,
        reg,
        60_000,
    );
    store.absorb(
        [
            {kind: 'novelty', ref: 'fp-c', time: 900_000},
            {kind: 'novelty', ref: 'fp-d', time: 900_001},
        ],
        index,
        reg,
        60_000,
    );
    const listed = store.list();
    t.equal(listed.length, 2, 'two traces, two incidents');
    t.ok(listed[0].lastAt >= listed[1].lastAt, 'newest first');
    t.end();
});

t.test('a buffer too small to hold two anomalies cannot form a correlation', t => {
    const index = lineage();
    const reg = registry();
    const one = new IncidentStore(1);
    t.same(one.absorb([{kind: 'novelty', ref: 'fp-payer', time: 10}], index, reg, 60_000), [], 'nothing to join');
    t.same(
        one.absorb([{kind: 'novelty', ref: 'fp-payee', time: 30}], index, reg, 60_000),
        [],
        'the first was evicted before the second arrived',
    );
    t.same(one.list(), [], 'so no incident was opened');

    // The same two arrivals correlate under a buffer that can hold both, which
    // is what makes the bound the reason the first store saw nothing.
    const two = new IncidentStore(2);
    two.absorb([{kind: 'novelty', ref: 'fp-payer', time: 10}], index, reg, 60_000);
    const joined = two.absorb([{kind: 'novelty', ref: 'fp-payee', time: 30}], index, reg, 60_000);
    t.equal(joined.length, 1, 'with room for both, the pair is one incident');
    t.equal(joined[0].services.length, 2);
    t.end();
});
