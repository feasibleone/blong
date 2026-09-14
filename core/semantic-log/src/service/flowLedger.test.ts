import t from 'tap';
import {FlowLedger} from './flowLedger.ts';
import type {IngestEvent} from './registry.ts';

const FLOW = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const OTHER = '01ARZ3NDEKTSV4RRFFQ69G5FAW';
const THIRD = '01ARZ3NDEKTSV4RRFFQ69G5FAX';
const KIND = 'transfer.single';

interface Call {
    id: string;
    time: number;
    service?: string;
    leg?: string;
    /** The receiver the caller declared. Absent on a receiver's own records. */
    to?: string;
    seq?: string;
    step?: string;
    status?: string;
    flowId?: string;
    /** The flow kind: omitted uses the default, `null` means the flow has none. */
    kind?: string | null;
    /** An event with no flow context at all — an emitter that predates it. */
    noFlow?: boolean;
}

/** One event, shaped like the wire an emitter sends (PRD R22/R9). */
function event(call: Call): IngestEvent {
    const {leg, to, seq, step, status, flowId, kind, noFlow, ...rest} = call;
    return {
        ...rest,
        fingerprint: `fp-${call.id}`,
        service: call.service ?? 'payer',
        ...(noFlow === true
            ? {}
            : {
                  flow: {
                      id: flowId ?? FLOW,
                      ...(kind === null ? {} : {kind: kind ?? KIND}),
                      ...(step === undefined ? {} : {step}),
                      ...(status === undefined ? {} : {status}),
                      ...(leg === undefined ? {} : {leg, legTo: to, legSeq: seq}),
                  },
              }),
    } as IngestEvent;
}

t.test('an event with no flow, or a flow id that is not a ULID, is declined', t => {
    const ledger = new FlowLedger();
    ledger.observe(event({id: 'a', time: 1, noFlow: true}));
    ledger.observe(event({id: 'b', time: 2, flowId: 'flow-1', leg: 'payer.quote.rates'}));
    t.equal(ledger.size(), 0, 'nothing is retained from either');
    t.same(ledger.kinds(), [], 'no kind is invented');
    t.same(ledger.unions(), [], 'and no union is published for one');
    t.equal(ledger.unionOf(KIND), undefined, 'a kind never observed has no union');
    t.equal(ledger.executionOf(FLOW), undefined, 'an execution never opened is not retained');
    t.equal(ledger.evictions(), 0);
    t.equal(ledger.truncations(), 0);
    t.end();
});

t.test('a declared call is an edge even when nothing answers (PRD R22)', t => {
    // This is what the declaration buys: the caller names both ends, so a receiver
    // that is missing, failing or wired to the wrong address still appears in the
    // observed shape. What its silence costs is the `observed` count — a fact about
    // the deployment, rather than an edge that cannot be drawn.
    const ledger = new FlowLedger();
    ledger.observe(
        event({id: 'a', time: 10, leg: 'payer.quote.rates', to: 'hub', seq: '2', step: 'quote'}),
    );

    const union = ledger.unionOf(KIND);
    t.equal(union?.executions, 1);
    t.same(
        union?.legs.map(leg => leg.leg),
        ['payer.quote.rates'],
    );
    t.same(
        union?.legs[0]?.ends,
        [{caller: 'payer', callee: 'hub', count: 1, observed: 0}],
        'the call is known, and known to be unanswered',
    );
    t.equal(union?.legs[0]?.seq, '2', 'with the position the caller assigned');
    t.equal(union?.legs[0]?.step, 'quote');
    t.same(union?.services, ['payer'], 'the receiver has not been seen at all');

    // The receiver's own record adopts the id and the position, so it credits the
    // edge rather than declaring a call of its own.
    ledger.observe(
        event({
            id: 'b',
            time: 12,
            service: 'hub',
            leg: 'payer.quote.rates',
            seq: '2',
            step: 'quote',
        }),
    );
    t.same(
        ledger.unionOf(KIND)?.legs[0]?.ends,
        [{caller: 'payer', callee: 'hub', count: 1, observed: 1}],
        'and the receipt turns it into an answered edge',
    );
    t.same(ledger.unionOf(KIND)?.services, ['payer', 'hub']);
    t.end();
});

t.test('a receipt credits only the call that aimed at it', t => {
    // Two declarations of one call id, to two different receivers: a reused id, which
    // is the mistake the id exists to make impossible — so it is reported rather than
    // resolved. Both are attempts, and only the one whose receiver answered is credited.
    const ledger = new FlowLedger();
    ledger.observe(event({id: 'a', time: 1, leg: 'payer.quote.rates', to: 'hub', seq: '1'}));
    ledger.observe(event({id: 'b', time: 2, leg: 'payer.quote.rates', to: 'payee', seq: '1'}));
    ledger.observe(event({id: 'c', time: 3, service: 'payee', leg: 'payer.quote.rates', seq: '1'}));
    t.same(
        ledger.unionOf(KIND)?.legs[0]?.ends,
        [
            {caller: 'payer', callee: 'hub', count: 1, observed: 0},
            {caller: 'payer', callee: 'payee', count: 1, observed: 1},
        ],
        'the call that aimed at the answering receiver is the answered one',
    );
    t.end();
});

t.test('a receipt that arrives before the declaration still credits it', t => {
    // Two services flush their sinks independently, so the receiver's record can reach
    // the service first. Crediting on arrival order would have made "was this call
    // answered" depend on which process flushed first — a coin flip wearing the
    // costume of a measurement.
    const ledger = new FlowLedger();
    ledger.observe(event({id: 'a', time: 1, service: 'hub', leg: 'payer.quote.rates', seq: '1'}));
    t.equal(
        ledger.unionOf(KIND)?.legs[0]?.ends.length,
        0,
        'a call seen only from the receiver names no caller, and none is invented',
    );
    ledger.observe(event({id: 'b', time: 2, leg: 'payer.quote.rates', to: 'hub', seq: '1'}));
    t.same(
        ledger.unionOf(KIND)?.legs[0]?.ends,
        [{caller: 'payer', callee: 'hub', count: 1, observed: 1}],
        'and the declaration is credited from the receipt already seen',
    );
    t.end();
});

t.test('a receiver that logs three records about one call answered it once', t => {
    const ledger = new FlowLedger();
    ledger.observe(event({id: 'a', time: 1, leg: 'hub.transfer.deliver', to: 'payee', seq: '1'}));
    ledger.observe(
        event({id: 'b', time: 2, service: 'payee', leg: 'hub.transfer.deliver', seq: '1'}),
    );
    ledger.observe(
        event({id: 'c', time: 3, service: 'payee', leg: 'hub.transfer.deliver', seq: '1'}),
    );
    ledger.observe(
        event({id: 'd', time: 4, service: 'payee', leg: 'hub.transfer.deliver', seq: '1'}),
    );
    t.same(
        ledger.unionOf(KIND)?.legs[0]?.ends,
        [{caller: 'payer', callee: 'payee', count: 1, observed: 1}],
        'the counters are per execution, not per record',
    );
    t.end();
});

t.test('the same call in another execution counts the edge again', t => {
    const ledger = new FlowLedger();
    ledger.observe(event({id: 'a', time: 1, leg: 'payer.quote.rates', to: 'hub', seq: '1'}));
    ledger.observe(event({id: 'b', time: 2, service: 'hub', leg: 'payer.quote.rates', seq: '1'}));
    ledger.observe(
        event({id: 'c', time: 3, flowId: OTHER, leg: 'payer.quote.rates', to: 'hub', seq: '1'}),
    );
    ledger.observe(
        event({
            id: 'd',
            time: 4,
            flowId: OTHER,
            service: 'hub',
            leg: 'payer.quote.rates',
            seq: '1',
        }),
    );
    t.equal(ledger.unionOf(KIND)?.executions, 2);
    t.same(ledger.unionOf(KIND)?.legs[0]?.ends, [
        {caller: 'payer', callee: 'hub', count: 2, observed: 2},
    ]);
    t.end();
});

t.test('a redelivered record is not a second attempt', t => {
    // The step id is what makes a redelivery a duplicate: the execution ULID names
    // the run, so nothing else keys the step itself. Without this the same record
    // arriving twice would count one attempt as two.
    const ledger = new FlowLedger();
    ledger.observe(event({id: 'same', time: 10, leg: 'payer.quote.rates', to: 'hub', seq: '1'}));
    ledger.observe(event({id: 'same', time: 11, leg: 'payer.quote.rates', to: 'hub', seq: '1'}));
    t.equal(ledger.executionOf(FLOW)?.observations.length, 1);
    t.same(ledger.unionOf(KIND)?.legs[0]?.ends, [
        {caller: 'payer', callee: 'hub', count: 1, observed: 0},
    ]);
    t.end();
});

t.test('a record that arrives after the terminal status is still observed', t => {
    // Arrival order is not emission order: between two processes it is not even a
    // hint of it. Measured on the single-scheme fixture, the payer's sink flushes
    // first, so its `transfer complete` reaches the service before the hub's last four
    // records — and refusing those lost the hub's own declaration of
    // `hub.transfer.deliver`, an entire edge of the observed flow. The status is a fact
    // about what the emitter reported, not a claim about what is still in flight.
    const ledger = new FlowLedger();
    ledger.observe(
        event({
            id: 'a',
            time: 1,
            leg: 'payer.quote.rates',
            to: 'hub',
            seq: '1',
            status: 'completed',
        }),
    );
    t.equal(ledger.executionOf(FLOW)?.closed, true, 'the terminal status is recorded as reported');
    ledger.observe(event({id: 'b', time: 2, leg: 'payer.transfer.submit', to: 'hub', seq: '2'}));
    t.equal(
        ledger.executionOf(FLOW)?.observations.length,
        2,
        'and a later delivery is observed, not dropped',
    );
    t.same(
        ledger.unionOf(KIND)?.legs.map(leg => leg.leg),
        ['payer.quote.rates', 'payer.transfer.submit'],
        'so the observed shape is the flow, not the flow minus whatever arrived late',
    );
    t.end();
});

t.test('a call site that logs several records about one call made one call', t => {
    // The payer's discovery logs twice inside the leg it bound (`looking up payee`,
    // `payee found`), and each record declares the receiver. One call site is one call:
    // counting per record reported the fixture's first hop as two calls of one execution
    // — a busy participant that does not exist.
    const ledger = new FlowLedger();
    ledger.observe(event({id: 'a', time: 1, leg: 'payer.discovery.parties', to: 'hub', seq: '1'}));
    ledger.observe(event({id: 'b', time: 2, leg: 'payer.discovery.parties', to: 'hub', seq: '1'}));
    ledger.observe(
        event({id: 'c', time: 3, service: 'hub', leg: 'payer.discovery.parties', seq: '1'}),
    );
    t.same(
        ledger.unionOf(KIND)?.legs[0]?.ends,
        [{caller: 'payer', callee: 'hub', count: 1, observed: 1}],
        'one declaration, one answer',
    );
    t.end();
});

t.test('calls are ordered by the position their caller assigned (PRD R22)', t => {
    // A counter, not a clock: two records inside one millisecond cannot be ordered by
    // a millisecond timestamp, and the paths a caller assigns are already the
    // depth-first order a sequence diagram is drawn in.
    const ledger = new FlowLedger();
    // Deliberately observed out of order: the drawing must not depend on arrival.
    ledger.observe(event({id: 'c', time: 30, leg: 'payer.transfer.submit', to: 'hub', seq: '3'}));
    ledger.observe(event({id: 'a', time: 10, leg: 'payer.discovery.parties', to: 'hub', seq: '1'}));
    ledger.observe(event({id: 'b1', time: 20, leg: 'hub.quote.fx', to: 'fxp', seq: '2.1'}));
    ledger.observe(event({id: 'b2', time: 21, leg: 'hub.quote.payee', to: 'payee', seq: '2.2'}));
    ledger.observe(event({id: 'b', time: 22, leg: 'payer.quote.rates', to: 'hub', seq: '2'}));
    t.same(
        ledger.unionOf(KIND)?.legs.map(leg => leg.leg),
        [
            'payer.discovery.parties',
            'payer.quote.rates',
            'hub.quote.fx',
            'hub.quote.payee',
            'payer.transfer.submit',
        ],
        '`1`, `2`, `2.1`, `2.2`, `3` — a call made while answering 2 belongs after it and before 3',
    );
    t.same(
        ledger.executionOf(FLOW)?.legs,
        [
            'payer.discovery.parties',
            'payer.quote.rates',
            'hub.quote.fx',
            'hub.quote.payee',
            'payer.transfer.submit',
        ],
        'the instance view orders its calls the same way',
    );
    t.end();
});

t.test('two calls that hold the same position are ordered by id', t => {
    // The same slot can be taken by different call sites in different executions — a
    // branch taken in one run and not another moves what is called where — so the
    // order falls back to something stable rather than to arrival.
    const ledger = new FlowLedger();
    ledger.observe(event({id: 'a', time: 1, leg: 'z.payer.call', to: 'hub', seq: '1'}));
    ledger.observe(
        event({id: 'b', time: 2, flowId: OTHER, leg: 'a.payer.call', to: 'hub', seq: '1'}),
    );
    t.same(
        ledger.unionOf(KIND)?.legs.map(leg => leg.leg),
        ['a.payer.call', 'z.payer.call'],
    );
    t.end();
});

t.test('a call with no position is still observed, and sorts last', t => {
    const ledger = new FlowLedger();
    ledger.observe(event({id: 'a', time: 1, leg: 'unpositioned.one', to: 'hub'}));
    ledger.observe(event({id: 'b', time: 2, leg: 'unpositioned.two', to: 'hub'}));
    ledger.observe(event({id: 'c', time: 3, leg: 'payer.quote.rates', to: 'hub', seq: '1'}));
    t.same(
        ledger.unionOf(KIND)?.legs.map(leg => leg.leg),
        ['payer.quote.rates', 'unpositioned.one', 'unpositioned.two'],
        'an emitter that sent no position is ordered by id, after the ones that did',
    );
    t.equal(ledger.unionOf(KIND)?.legs[1]?.seq, undefined);
    t.end();
});

t.test('the phase a call is drawn under is the one it was seen in most often', t => {
    const ledger = new FlowLedger();
    ledger.observe(
        event({id: 'a', time: 1, leg: 'payer.quote.rates', to: 'hub', seq: '1', step: 'quote'}),
    );
    ledger.observe(
        event({
            id: 'b',
            time: 2,
            flowId: OTHER,
            leg: 'payer.quote.rates',
            to: 'hub',
            seq: '1',
            step: 'transfer',
        }),
    );
    t.equal(ledger.unionOf(KIND)?.legs[0]?.step, 'quote', 'a tie is settled by first sight');
    ledger.observe(
        event({
            id: 'c',
            time: 3,
            flowId: THIRD,
            leg: 'payer.quote.rates',
            to: 'hub',
            seq: '1',
            step: 'transfer',
        }),
    );
    t.equal(ledger.unionOf(KIND)?.legs[0]?.step, 'transfer', 'and a majority wins');
    t.end();
});

t.test('a kindless execution is observed, but attributed to no kind', t => {
    const ledger = new FlowLedger();
    ledger.observe(
        event({id: 'a', time: 1, kind: null, leg: 'payer.quote.rates', to: 'hub', seq: '1'}),
    );
    t.same(ledger.kinds(), [], 'a flow with no stable name has no union to belong to');
    t.equal(
        ledger.executionOf(FLOW)?.observations.length,
        1,
        'its calls are retained for the instance view',
    );

    // A kind that arrives on a later record is adopted then, and counted then — the
    // execution was attributed to a ULID from the start, so the call seen before the
    // kind was known is not retroactively credited to it.
    ledger.observe(event({id: 'b', time: 2, leg: 'payer.transfer.submit', to: 'hub', seq: '2'}));
    t.same(ledger.kinds(), [KIND]);
    t.equal(ledger.unionOf(KIND)?.executions, 1, 'counted when it became known');
    t.same(
        ledger.unionOf(KIND)?.legs.map(leg => leg.leg),
        ['payer.transfer.submit'],
    );

    // An empty kind is not a name.
    ledger.observe(
        event({
            id: 'c',
            time: 3,
            flowId: OTHER,
            kind: '',
            leg: 'payer.quote.rates',
            to: 'hub',
            seq: '1',
        }),
    );
    t.same(ledger.kinds(), [KIND], 'and an empty kind is not one');
    t.end();
});

t.test('the executions are published most recently observed first', t => {
    const ledger = new FlowLedger();
    ledger.observe(
        event({
            id: 'a',
            time: 1,
            leg: 'payer.quote.rates',
            to: 'hub',
            seq: '1',
            status: 'completed',
        }),
    );
    ledger.observe(
        event({id: 'b', time: 2, flowId: OTHER, kind: 'transfer.inter', service: 'hubA'}),
    );
    t.same(
        ledger.executions().map(execution => execution.id),
        [OTHER, FLOW],
        'the one observed since is first — and no two can tie, the counter only ever rises',
    );
    const summary = ledger.executions()[1];
    t.notOk(Object.hasOwn(summary, 'observations'), 'the summary is not the detail');
    t.equal(summary.id, FLOW);
    t.equal(summary.kind, KIND);
    t.same(summary.services, ['payer'], 'the participants, in first-observation order');
    t.same(summary.legs, ['payer.quote.rates'], 'the calls, in position order');
    t.equal(summary.refs.length, 1, 'the shape drift compares');
    t.equal(summary.closed, true, 'and whether the emitter reported an end');
    t.end();
});

t.test('a service takes part in an execution whether or not it made a call', t => {
    // The entry records between hops belong to the flow: a diagram that named only the
    // services on the ends of calls would be missing a participant the records show.
    const ledger = new FlowLedger();
    ledger.observe(event({id: 'a', time: 1, leg: 'payer.quote.rates', to: 'hub', seq: '1'}));
    ledger.observe(event({id: 'b', time: 2, service: 'hub'}));
    t.same(
        ledger.executionOf(FLOW)?.services,
        ['payer', 'hub'],
        'both, in first-observation order',
    );
    t.same(
        ledger.unionOf(KIND)?.legs[0]?.services,
        ['payer'],
        'while the call names who logged it',
    );
    t.end();
});

t.test('the kinds are published most recently observed first, then by name', t => {
    const ledger = new FlowLedger();
    // Two kinds adopted from records that traversed no call: neither aggregate is
    // touched, so the order cannot come from recency and has to come from the data.
    ledger.observe(event({id: 'a', time: 1, kind: 'b.kind'}));
    ledger.observe(event({id: 'b', time: 2, flowId: OTHER, kind: 'a.kind'}));
    t.same(ledger.kinds(), ['a.kind', 'b.kind'], 'a tie is settled by the kind name');

    ledger.observe(
        event({id: 'c', time: 3, kind: 'b.kind', leg: 'payer.quote.rates', to: 'hub', seq: '1'}),
    );
    t.same(ledger.kinds(), ['b.kind', 'a.kind'], 'and a kind observed since moves to the front');
    t.end();
});

t.test('both retention bounds are reported, neither silently', t => {
    const ledger = new FlowLedger(1, 1);
    ledger.observe(event({id: 'a', time: 1, leg: 'payer.quote.rates', to: 'hub', seq: '1'}));
    ledger.observe(event({id: 'b', time: 2, leg: 'payer.transfer.submit', to: 'hub', seq: '2'}));
    t.equal(ledger.truncations(), 1, 'the call over the per-execution cap is counted');
    t.equal(ledger.executionOf(FLOW)?.observations.length, 1);

    ledger.observe(
        event({id: 'c', time: 3, flowId: OTHER, leg: 'payer.quote.rates', to: 'hub', seq: '1'}),
    );
    t.equal(ledger.evictions(), 1, 'and the execution over the cap is counted');
    t.equal(ledger.executionOf(FLOW), undefined, 'the least recently touched is the one dropped');
    t.equal(ledger.executionOf(OTHER)?.id, OTHER, 'while the most recent stays');
    t.end();
});

t.test('the detail handed out is a copy, not the ledger itself', t => {
    const ledger = new FlowLedger();
    ledger.observe(event({id: 'a', time: 1, leg: 'payer.quote.rates', to: 'hub', seq: '1'}));
    const execution = ledger.executionOf(FLOW);
    execution?.observations.pop();
    execution?.legs.push('invented.call');
    execution?.refs.pop();
    t.equal(
        ledger.executionOf(FLOW)?.observations.length,
        1,
        'mutating the answer does not reach the ledger',
    );
    t.same(ledger.executionOf(FLOW)?.legs, ['payer.quote.rates']);
    t.equal(ledger.executionOf(FLOW)?.refs.length, 1);

    const union = ledger.unionOf(KIND);
    union?.legs.pop();
    union?.services.pop();
    t.equal(ledger.unionOf(KIND)?.legs.length, 1);
    t.same(ledger.unionOf(KIND)?.services, ['payer']);
    t.end();
});

t.test('the unions survive a round trip through a snapshot', t => {
    const ledger = new FlowLedger();
    ledger.observe(
        event({id: 'a', time: 1, leg: 'payer.quote.rates', to: 'hub', seq: '1', step: 'quote'}),
    );
    ledger.observe(
        event({
            id: 'b',
            time: 2,
            service: 'hub',
            leg: 'payer.quote.rates',
            seq: '1',
            step: 'quote',
        }),
    );
    // A second call with no step, so both shapes of the restored step map are
    // exercised: one call that knows its phase and one that does not.
    ledger.observe(event({id: 'c', time: 3, leg: 'hub.quote.fx', to: 'fxp', seq: '2'}));
    // And one with no position, so the restored order has to cope with that too.
    ledger.observe(event({id: 'd', time: 4, leg: 'unpositioned.one', to: 'hub'}));

    const restored = new FlowLedger();
    restored.restore(ledger.unions());
    t.same(
        restored.unionOf(KIND),
        ledger.unionOf(KIND),
        'what was observed before a restart is observed after',
    );
    t.equal(restored.unionOf(KIND)?.legs[1]?.step, undefined, 'a call with no phase keeps none');

    restored.restore([]);
    t.same(restored.kinds(), [], 'restoring an empty snapshot observes nothing');
    t.end();
});
