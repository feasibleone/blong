import t from 'tap';
import type {DiagramCall, DiagramItem, DiagramModel, DiagramObservation} from './diagram.ts';
import {modelOfExecution, modelOfObservations, modelOfUnion, renderSequence} from './diagram.ts';
import type {FlowExecution, LegEnd, ObservedLeg} from './flowLedger.ts';
import {FlowLedger} from './flowLedger.ts';

const FLOW = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const KIND = 'transfer.single';

/** One observation, with the fields a test cares about named explicitly. */
/**
 * The unit a fixture's leg id names first — the caller, read off the id.
 *
 * This file's legs are written the way they were before the caller became a field of its own
 * (`payer.quote.rates`), and the helper states the caller from it so a case reads the same as
 * it always did. A case that is *about* the caller passes `from` in `rest`.
 */
function callerOf(leg: string): string {
    const at = leg.search(/[./]/);
    return at < 0 ? leg : leg.slice(0, at);
}

function observed(
    leg: string,
    service: string,
    rest: Partial<DiagramObservation> = {},
): DiagramObservation {
    return {leg, service, from: callerOf(leg), time: 1, ref: `ref-${leg}-${service}`, ...rest};
}

/** The items of a model, flattened for comparison. */
function drawn(model: {items: readonly DiagramItem[]}): string[] {
    return model.items.map(item => {
        if (item.kind === 'call') {
            return `call ${item.leg} ${item.caller}->${item.callee} x${item.count}/${item.observed}`;
        }
        if (item.kind === 'response') {
            return `response ${item.leg} ${item.callee}->${item.caller}`;
        }
        if (item.kind === 'progress') {
            return `progress ${item.leg} ${item.service} [${item.notes
                .map(note => note.text)
                .join(', ')}]`;
        }
        if (item.kind === 'region') {
            return `region ${item.discriminator} [${item.branches
                .map(branch => `${branch.name}${branch.chosen ? '*' : ''} x${branch.count}`)
                .join(', ')}]`;
        }
        return `receipt ${item.leg} ${item.service}`;
    });
}

/** The legs a model draws, in order — a region is not a leg. */
function legs(model: {items: readonly DiagramItem[]}): string[] {
    return model.items.flatMap(item => (item.kind === 'call' ? [item.leg] : []));
}

/** One union leg, with the fields a test cares about named explicitly. */
function unionLeg(leg: string, ends: LegEnd[], rest: Partial<ObservedLeg> = {}): ObservedLeg {
    return {
        leg,
        count: ends.reduce((sum, end) => sum + end.count, 0),
        first: 1,
        last: 2,
        services: [],
        ends,
        ...rest,
    };
}

/** The legs a model draws, in order, with regions flattened — a region is not a leg. */
function flat(model: {items: readonly DiagramItem[]}): DiagramItem[] {
    return model.items.flatMap(item =>
        item.kind === 'region'
            ? item.branches.flatMap(branch => flat({items: branch.items}))
            : [item],
    );
}

t.test(
    'a call made inside a branch is drawn in an alt block, with the branch not taken left empty',
    t => {
        const model = modelOfObservations([
            observed('fxp.quote.rates', 'fxp', {
                to: 'hub',
                seq: '1',
                regions: [
                    {
                        id: '1',
                        discriminator: 'rate-within-limit',
                        candidates: ['decline', 'accept'],
                        chosen: 'decline',
                    },
                ],
                points: ['rate-declined'],
            }),
        ]);
        t.same(
            drawn(model),
            ['region rate-within-limit [decline* x1, accept x0]'],
            'PRD R27: every candidate is a branch, and only the one that ran has anything in it',
        );
        const mermaid = renderSequence(model);
        // The arms are ordered for mermaid, not for the code: the empty ones come first so that
        // `end` is never preceded by a section with nothing in it. Only the order changes — the
        // labels still name the candidates, and `accept` is still the one declared second.
        t.match(mermaid, /alt rate-within-limit = accept/);
        t.match(mermaid, /else decline/);
        t.match(mermaid, /^\s+end$/m, 'the block is closed');
        t.match(
            mermaid,
            /Note over fxp: point: rate-declined/,
            'a milestone is a note over the participant that reported it',
        );
        t.equal(flat(model).length, 1, 'the call is inside the block, not beside it');
        t.end();
    },
);

t.test('a block whose arms are all empty still renders, saying so', t => {
    // Mermaid refuses a section with nothing in it when it is the last before `end`, so a region
    // with nothing to draw in any arm is given a note in its last one: the branch ran and nothing
    // inside it was observed, which is content, and a block that failed to draw says nothing at
    // all. Built by hand because every path through the builders leaves the arm that ran holding
    // at least the call or the receipt that carried the branch — this is the defensive shape.
    const model: DiagramModel = {
        services: ['payer', 'hub'],
        items: [
            {
                kind: 'region',
                discriminator: 'rate-within-limit',
                branches: [
                    {name: 'decline', chosen: true, weighed: true, count: 0, items: []},
                    {name: 'accept', chosen: false, weighed: false, count: 0, items: []},
                ],
            },
        ],
    };
    t.match(
        renderSequence(model),
        /else accept — not weighed\n\s+Note over payer: nothing observed yet\n\s+end/m,
        'the last arm says what was observed instead of being empty',
    );
    t.end();
});

t.test('a branch the candidate list never named is still drawn as the branch that ran', t => {
    const model = modelOfObservations([
        observed('fxp.quote.rates', 'fxp', {
            to: 'hub',
            seq: '1',
            regions: [{id: '1', discriminator: 'd', candidates: ['a', 'b'], chosen: 'c'}],
        }),
    ]);
    t.same(
        drawn(model),
        ['region d [a x0, b x0, c* x1]'],
        'the branch that ran is marked, and the candidates that did not are still drawn',
    );
    t.end();
});

t.test(
    'an answer is drawn inside the branch its call was made in, and a nested branch nests',
    t => {
        const mark = (id: string, discriminator: string, candidates: string[], chosen: string) => ({
            id,
            discriminator,
            candidates,
            chosen,
        });
        const chain = [
            mark('1', 'corridor', ['hubB', 'hold'], 'hubB'),
            mark('1.1', 'rate-within-limit', ['decline', 'accept'], 'accept'),
        ];
        const model = modelOfObservations([
            observed('hub.proxy.transfer', 'hub', {to: 'proxy', seq: '1', regions: chain}),
            observed('hub.proxy.transfer', 'proxy', {from: 'hub', seq: '1', regions: chain}),
        ]);
        const lines = renderSequence(model).split('\n');
        // `findIndex` on the line's prefix, not `indexOf`: a block's label carries the branch
        // that opens it, so the line is `alt corridor = hubB`, not `alt corridor`.
        const outer = lines.findIndex(line => line.startsWith('    alt corridor'));
        const inner = lines.findIndex(line => line.startsWith('    alt rate-within-limit'));
        const answer = lines.findIndex(line => line.includes('-->>'));
        const firstEnd = lines.indexOf('    end');
        t.ok(outer > -1, 'the enclosing branch is drawn');
        t.ok(inner > outer, 'the nested branch is inside it');
        t.ok(
            answer > inner && answer < firstEnd,
            'the answer to a call made in the branch is drawn in the same block, not after it',
        );
        t.end();
    },
);

t.test('a union draws the branches a call was declared in, each with its own counts', t => {
    const model = modelOfUnion({
        kind: 'transfer.single',
        executions: 3,
        services: ['hub'],
        legs: [
            unionLeg(
                'hub.fxp.quote',
                [
                    {
                        caller: 'hub',
                        callee: 'fxp',
                        count: 3,
                        observed: 3,
                        branches: [
                            {
                                discriminator: 'rate-within-limit',
                                candidates: ['decline', 'accept'],
                                chosen: 'accept',
                                count: 2,
                                observed: 2,
                            },
                            {
                                discriminator: 'rate-within-limit',
                                candidates: ['decline', 'accept'],
                                chosen: 'decline',
                                count: 1,
                                observed: 1,
                            },
                        ],
                    },
                ],
                {seq: '1'},
            ),
        ],
    });
    t.same(
        drawn(model),
        ['region rate-within-limit [decline x1, accept* x1]', 'response hub.fxp.quote fxp->hub'],
        'one block, both branches populated — a union is where both outcomes were really seen',
    );
    const mermaid = renderSequence(model);
    t.match(mermaid, /alt rate-within-limit/);
    t.match(
        mermaid,
        /else accept/,
        'the other candidate is drawn as an `else`, in evaluation order',
    );
    t.match(mermaid, /x2/, 'the branch taken twice shows it on its own arrow');
    t.equal(
        mermaid.split('\n').filter(line => line.includes('hub->>fxp') && !line.includes('-->>'))
            .length,
        2,
        'one arrow per branch, because the counts are per branch',
    );
    t.end();
});

t.test('a union call never inside a branch is drawn flat, with no block around it', t => {
    const model = modelOfUnion({
        kind: 'transfer.single',
        executions: 1,
        services: ['payer'],
        legs: [
            unionLeg(
                'payer.hub.submit',
                [{caller: 'payer', callee: 'hub', count: 1, observed: 1}],
                {
                    seq: '1',
                },
            ),
        ],
    });
    t.same(drawn(model), [
        'call payer.hub.submit payer->hub x1/1',
        'response payer.hub.submit hub->payer',
    ]);
    t.notMatch(renderSequence(model), /alt /, 'nothing was branched, so nothing is boxed');
    t.end();
});

t.test('a receipt observed inside a branch is drawn inside the block it was made in', t => {
    const model = modelOfObservations([
        observed('hub.proxy.corridor', 'proxy', {
            from: 'hub',
            seq: '1',
            regions: [
                {
                    id: '1',
                    discriminator: 'route-selection',
                    candidates: ['hubB', 'hold'],
                    chosen: 'hubB',
                },
            ],
        }),
    ]);
    t.same(
        drawn(model),
        ['region route-selection [hubB* x1, hold x0]'],
        'a call nobody declared is still drawn where it was received',
    );
    t.end();
});

t.test('a call is one call however many records were logged inside it', t => {
    // Several records from one call site are one call: counting them would report a
    // chatty participant as a busy one. The receiver answered, so it is answered — and
    // the answer is drawn back over the same leg id rather than folded into the call.
    const model = modelOfObservations([
        observed('payer.quote.rates', 'payer', {
            to: 'hub',
            seq: '1',
            step: 'quote',
            notes: ['rate limit 5%'],
        }),
        observed('payer.quote.rates', 'payer', {to: 'hub', seq: '1', step: 'quote'}),
        observed('payer.quote.rates', 'hub', {
            seq: '1',
            step: 'quote',
            notes: ['withheld: routing'],
        }),
    ]);
    t.same(
        drawn(model),
        ['call payer.quote.rates payer->hub x1/1', 'response payer.quote.rates hub->payer'],
        'one call, answered, and the answer drawn back',
    );
    const call = model.items[0] as DiagramCall;
    t.same(
        call.notes,
        [
            {text: 'rate limit 5%', over: 'payer'},
            {text: 'withheld: routing', over: 'hub'},
        ],
        'every note the leg carried travels with it, from whichever end logged it, and is drawn\n' +
            'over the end that logged it: a note a receiver announced is its work, not the callers',
    );
    t.same(model.services, ['payer', 'hub'], 'the participants are the units the call names');
    t.end();
});

t.test('a receiver announces between the arrows, and its branch wraps only what followed it', t => {
    // The receiver's work is not the caller's: it happens while the call is open, so it is
    // drawn between the request and the answer, and the branch it took sits between them too.
    // The record says how many of its points came before that decision, because a branch
    // cannot have caused work that was already done (PRD R27).
    const model = modelOfObservations([
        observed('db/gateway.bundle.merge', 'gateway', {from: 'gateway', to: 'db', seq: '1'}),
        observed('db/gateway.bundle.merge', 'db', {
            seq: '1',
            points: ['merge-started', 'roles-merged', 'role-bit-allocated', 'graph-merged'],
            regions: [
                {
                    id: '1',
                    discriminator: 'role-bit',
                    candidates: ['declared', 'allocated'],
                    chosen: 'allocated',
                    pointsBefore: 2,
                },
            ],
        }),
    ]);
    t.same(
        drawn(model),
        [
            'call db/gateway.bundle.merge gateway->db x1/1',
            'progress db/gateway.bundle.merge db [point: merge-started, point: roles-merged]',
            'region role-bit [declared x0, allocated* x0]',
            'response db/gateway.bundle.merge db->gateway',
        ],
        'the work before the decision sits outside the block, and the answer outside it too',
    );
    const lines = renderSequence(model).split('\n');
    const at = (text: string): number => lines.findIndex(line => line.includes(text));
    t.ok(at('gateway->>db') < at('point: merge-started'), 'the request is drawn before the work');
    t.ok(
        at('point: roles-merged') < at('alt role-bit'),
        'what was announced before the decision stays outside the block',
    );
    t.ok(at('alt role-bit') < at('point: role-bit-allocated'), 'and what followed it is inside');
    t.ok(at('point: graph-merged') < at('end'), 'to the end of the block');
    t.ok(at('end') < at('db-->>gateway'), 'which closes before the answer');
    t.end();
});

t.test('every candidate is drawn, and the ones the decision never reached say so', t => {
    // A decision stops at the branch it takes, so a candidate declared after it never had its
    // predicate run. It is still drawn — the code offers it — and labelled, so a reader is not left
    // to read an unreached alternative as one that was weighed and refused (T-140).
    const model = modelOfObservations([
        observed('db/gateway.bundle.merge', 'gateway', {from: 'gateway', to: 'db', seq: '1'}),
        observed('db/gateway.bundle.merge', 'db', {
            seq: '1',
            points: ['rows-listed'],
            regions: [
                {
                    id: '1',
                    discriminator: 'result-shape',
                    candidates: ['array', 'result-set', 'empty'],
                    chosen: 'result-set',
                    pointsBefore: 0,
                },
            ],
        }),
    ]);
    const lines = renderSequence(model).split('\n');
    t.ok(
        lines.some(line => line.includes('alt result-shape = array')),
        'the first candidate opens the block, whether or not it was reached',
    );
    t.ok(
        lines.some(line => line.includes('else result-set') && !line.includes('not weighed')),
        'the branch that was taken is named without a qualifier',
    );
    t.ok(
        lines.some(line => line.includes('else empty — not weighed')),
        'and a candidate the decision never reached says so',
    );
    t.end();
});

t.test('an answer is drawn on the unwind, after the calls it made were answered', t => {
    // The caller is blocked on its callee, which was blocked on its own: the payer's
    // answer arrives after the hub has answered the payee, not when the request went out.
    // The positions are what say so — `1.1` is a call made inside `1`.
    const model = modelOfObservations([
        observed('payer.discovery.parties', 'payer', {to: 'hub', seq: '1'}),
        observed('payer.discovery.parties', 'hub', {seq: '1'}),
        observed('hub.discovery.payee', 'hub', {to: 'payee', seq: '1.1'}),
        observed('hub.discovery.payee', 'payee', {seq: '1.1'}),
    ]);
    t.equal(
        renderSequence(model),
        'sequenceDiagram\n' +
            '    autonumber\n' +
            '    participant payer\n' +
            '    participant hub\n' +
            '    participant payee\n' +
            '    payer->>hub: payer.discovery.parties\n' +
            '    hub->>payee: hub.discovery.payee\n' +
            '    payee-->>hub: hub.discovery.payee\n' +
            '    hub-->>payer: payer.discovery.parties\n',
        'the nested answer comes back before the answer that carried it',
    );
    t.end();
});

t.test('a call that never leaves its own participant is drawn once', t => {
    // A self-hop — the same participant named on both ends — is one arrow, not a pair. The
    // answer back would repeat the caller, the receiver, the label and the step, which is
    // exactly the repetition a sequence diagram is read to avoid: the dashed arrow exists
    // to show *another* participant answering, and there is no other participant here. The
    // call is still an *answered* call — the receiver's record is there, so the arrow stays
    // solid rather than crossed — so "answered" is not lost with the pair.
    //
    // Both ends are read off the call, so a self-hop is an id that names its own target as
    // its caller: `blong.flow.find` aimed at `blong` is the `blong` unit calling itself.
    const observations = [
        observed('blong.flow.find', 'blong', {to: 'blong', seq: '1'}),
        observed('blong.flow.find', 'blong', {seq: '1'}),
    ];
    t.same(
        drawn(modelOfObservations(observations)),
        ['call blong.flow.find blong->blong x1/1'],
        'one execution: the call, and no answer to itself',
    );
    t.equal(
        renderSequence(modelOfObservations(observations)),
        'sequenceDiagram\n' +
            '    autonumber\n' +
            '    participant blong\n' +
            '    blong->>blong: blong.flow.find\n',
        'and it renders as the solid arrow it is',
    );
    t.same(
        drawn(
            modelOfUnion({
                kind: 'blong.flow.find',
                executions: 1,
                services: ['blong'],
                legs: [
                    unionLeg('blong.flow.find', [
                        {caller: 'blong', callee: 'blong', count: 1, observed: 1},
                    ]),
                ],
            }),
        ),
        ['call blong.flow.find blong->blong x1/1'],
        'the union keeps the same rule, so the two views cannot disagree about a self-hop',
    );
    t.end();
});

t.test('a call with no position has no place for its answer, so none is drawn', t => {
    // Nothing says where such a call sits, so an answer would be an arrow in a place the
    // records do not support. The call itself is still drawn — and still answered: its
    // count is the evidence, and it is what a reader is left with.
    const model = modelOfObservations([
        observed('payer.quote.rates', 'payer', {to: 'hub'}),
        observed('payer.quote.rates', 'hub', {}),
    ]);
    t.same(
        drawn(model),
        ['call payer.quote.rates payer->hub x1/1'],
        'the call, its count, and no arrow that could not be placed',
    );
    t.end();
});

t.test('a declared call nobody answered is still drawn', t => {
    const model = modelOfObservations([
        observed('hub.transfer.deliver', 'hub', {to: 'payee', seq: '1'}),
    ]);
    t.same(
        drawn(model),
        ['call hub.transfer.deliver hub->payee x1/0'],
        'the attempt is on the diagram',
    );
    t.end();
});

t.test('a call only its receiver shows cannot be an arrow', t => {
    // An arrow needs a source, and the only source here would be an invention. It is
    // reported as what it is: records carrying a call nobody was seen to make.
    const model = modelOfObservations([observed('payer.quote.rates', 'hub', {seq: '1'})]);
    t.same(drawn(model), ['receipt payer.quote.rates hub'], 'a receipt, not an arrow');
    t.end();
});

t.test('a reused id is two arrows, and its notes are not dropped', t => {
    // One id declared to two receivers is the mistake the id exists to make
    // impossible, so it is reported rather than resolved: a receipt says the leg was
    // answered and not which of the two declared targets answered it, so neither arrow
    // claims an answer - the same reading the ledger's union makes of it (D-211).
    const model = modelOfObservations([
        observed('payer.quote.rates', 'payer', {to: 'hub', seq: '1', notes: ['one']}),
        observed('payer.quote.rates', 'payer', {to: 'payee', seq: '1'}),
        observed('payer.quote.rates', 'payee', {seq: '1'}),
    ]);
    t.same(
        drawn(model),
        ['call payer.quote.rates payer->hub x1/0', 'call payer.quote.rates payer->payee x1/0'],
        'both attempts, and neither of them claims the receipt',
    );
    t.same(
        (model.items[0] as DiagramCall).notes,
        [{text: 'one', over: 'payer'}],
        'the leg says the same thing on both arrows',
    );
    t.same((model.items[1] as DiagramCall).notes, [{text: 'one', over: 'payer'}]);
    t.end();
});

t.test('calls are drawn in the order their positions give them', t => {
    // Arrival order is not execution order: two services flush their sinks
    // independently, so the records can reach the service in any order at all.
    const model = modelOfObservations([
        observed('payer.transfer.submit', 'payer', {to: 'hub', seq: '3'}),
        observed('payer.discovery.parties', 'payer', {to: 'hub', seq: '1.1'}),
        observed('payer.quote.rates', 'payer', {to: 'hub', seq: '2'}),
        observed('payer.discovery.parties', 'payer', {to: 'hub', seq: '1'}),
    ]);
    t.same(
        legs(model),
        ['payer.discovery.parties', 'payer.quote.rates', 'payer.transfer.submit'],
        'by counter path numerically, and one leg is one call however many records it logged',
    );
    t.end();
});

t.test('a call observed without a position sorts last, and ties settle by id', t => {
    const model = modelOfObservations([
        observed('payer.quote.rates', 'payer', {to: 'hub'}),
        observed('payer.transfer.submit', 'payer', {to: 'hub', seq: '1'}),
        observed('payer.discovery.parties', 'payer', {to: 'hub'}),
    ]);
    t.same(
        legs(model),
        ['payer.transfer.submit', 'payer.discovery.parties', 'payer.quote.rates'],
        'positioned first, then the unpositioned by id',
    );
    t.end();
});

t.test('the model of an execution is its observations, with its own participants', t => {
    const ledger = new FlowLedger();
    ledger.observe({
        id: 'a',
        time: 1,
        fingerprint: 'fp-1',
        service: 'payer',
        flow: {
            id: FLOW,
            kind: KIND,
            leg: 'payer.quote.rates',
            legFrom: 'payer',
            legTo: 'hub',
            legSeq: '1',
            step: 'quote',
        },
    });
    ledger.observe({
        id: 'b',
        time: 2,
        fingerprint: 'fp-2',
        service: 'hub',
        flow: {id: FLOW, kind: KIND},
    });
    const execution = ledger.executionOf(FLOW);
    t.ok(execution, 'retained');
    const model = modelOfExecution(execution as FlowExecution);
    t.same(drawn(model), ['call payer.quote.rates payer->hub x1/0'], 'the call, unanswered');
    t.same(
        model.services,
        ['payer', 'hub'],
        'a record needs no call to prove its service took part — the entry records count too',
    );
    t.end();
});

t.test('a kind model carries the union it was aggregated from', t => {
    const model = modelOfUnion({
        kind: KIND,
        executions: 12,
        services: ['payer', 'hub'],
        legs: [
            unionLeg(
                'payer.quote.rates',
                [{caller: 'payer', callee: 'hub', count: 12, observed: 12}],
                {
                    step: 'quote',
                    seq: '1',
                },
            ),
            unionLeg(
                'hub.transfer.deliver',
                [{caller: 'hub', callee: 'payee', count: 12, observed: 11}],
                {
                    step: 'transfer',
                    seq: '2',
                },
            ),
        ],
    });
    t.same(
        drawn(model),
        [
            'call payer.quote.rates payer->hub x12/12',
            'response payer.quote.rates hub->payer',
            'call hub.transfer.deliver hub->payee x12/11',
            'response hub.transfer.deliver payee->hub',
        ],
        'the counts a kind diagram has that an execution diagram cannot, each with its answer',
    );
    t.same(
        model.services,
        ['payer', 'hub', 'payee'],
        'the participants are the units its calls name, over every execution',
    );
    t.end();
});

t.test('a union leg with no end names the service that logged it, or says it cannot', t => {
    // `unobserved` is reached by a model assembled by hand or restored from a
    // snapshot: a call with no declared end and no observed service has no receiver to
    // name, and a note still has to be drawn over something.
    const model = modelOfUnion({
        kind: KIND,
        executions: 1,
        services: [],
        legs: [
            unionLeg('payer.quote.rates', [], {services: ['hub']}),
            unionLeg('hub.transfer.deliver', [], {services: []}),
        ],
    });
    t.same(
        drawn(model),
        ['receipt payer.quote.rates hub', 'receipt hub.transfer.deliver unobserved'],
        'the receiver when one was seen, and an honest blank when none was',
    );
    t.end();
});

t.test('a rendered diagram is a sequence diagram of what was observed', t => {
    const model = modelOfObservations([
        observed('payer.discovery.parties', 'payer', {to: 'hub', seq: '1', step: 'discovery'}),
        observed('payer.discovery.parties', 'hub', {seq: '1', step: 'discovery'}),
        observed('payer.quote.rates', 'payer', {
            to: 'hub',
            seq: '2',
            step: 'quote',
            notes: ['decision: accept'],
        }),
        observed('payer.quote.rates', 'hub', {seq: '2', step: 'quote'}),
        observed('payer.transfer.submit', 'payer', {to: 'hub', seq: '3', step: 'transfer'}),
        observed('payer.transfer.submit', 'payer', {to: 'payee', seq: '3', step: 'transfer'}),
    ]);
    t.equal(
        renderSequence(model),
        'sequenceDiagram\n' +
            '    autonumber\n' +
            '    participant payer\n' +
            '    participant hub\n' +
            '    participant payee\n' +
            '    Note over payer, payee: PHASE 1: discovery\n' +
            '    payer->>hub: payer.discovery.parties\n' +
            '    hub-->>payer: payer.discovery.parties\n' +
            '    Note over payer, payee: PHASE 2: quote\n' +
            '    Note over payer: decision: accept\n' +
            '    payer->>hub: payer.quote.rates\n' +
            '    hub-->>payer: payer.quote.rates\n' +
            '    Note over payer, payee: PHASE 3: transfer\n' +
            '    payer--xhub: payer.transfer.submit (no receipt)\n' +
            '    payer--xpayee: payer.transfer.submit (no receipt)\n',
        'the calls, the answers that came back, and the bands they were observed in',
    );
    t.end();
});

t.test('a step that repeats is a new band, and a call with no step is drawn bare', t => {
    const model = modelOfObservations([
        observed('payer.b', 'payer', {to: 'hub', seq: '1'}),
        observed('payer.c', 'payer', {to: 'hub', seq: '2', step: 'quote'}),
        observed('payer.d', 'payer', {to: 'hub', seq: '3', step: 'quote'}),
        observed('payer.e', 'payer', {to: 'hub', seq: '4', step: 'transfer'}),
    ]);
    const bands = renderSequence(model)
        .split('\n')
        .filter(line => line.includes('PHASE'));
    t.same(
        bands,
        ['    Note over payer, hub: PHASE 1: quote', '    Note over payer, hub: PHASE 2: transfer'],
        'a band is drawn when the step changes, not once per call',
    );
    t.equal(
        renderSequence(model).trimEnd().split('\n')[4],
        '    payer--xhub: payer.b (no receipt)',
        'a call with no step is drawn bare, before any band',
    );
    t.end();
});

t.test('a band over one participant is drawn without a comma', t => {
    // A self-call is a legal sequence: one participant, so there is no cast to span.
    const model: {services: string[]; items: DiagramCall[]} = {
        services: [],
        items: [
            {
                kind: 'call',
                leg: 'hub.settle.retry',
                caller: 'hub',
                callee: 'hub',
                step: 'transfer',
                notes: [],
                count: 1,
                observed: 1,
            },
        ],
    };
    t.equal(
        renderSequence(model),
        'sequenceDiagram\n' +
            '    autonumber\n' +
            '    participant hub\n' +
            '    Note over hub: PHASE 1: transfer\n' +
            '    hub->>hub: hub.settle.retry\n',
        'one participant, one band, no comma',
    );
    t.end();
});

t.test('the counts a call did not have the usual shape for are said out loud', t => {
    const model: {services: string[]; items: DiagramCall[]} = {
        services: [],
        items: [
            {
                kind: 'call',
                leg: 'a.b',
                caller: 'payer',
                callee: 'hub',
                notes: [],
                count: 3,
                observed: 3,
            },
            {
                kind: 'call',
                leg: 'a.c',
                caller: 'payer',
                callee: 'hub',
                notes: [],
                count: 3,
                observed: 1,
            },
            {
                kind: 'call',
                leg: 'a.d',
                caller: 'payer',
                callee: 'hub',
                notes: [],
                count: 1,
                observed: 1,
            },
        ],
    };
    const lines = renderSequence(model).trimEnd().split('\n');
    t.equal(lines[4], '    payer->>hub: a.b x3', 'a call every execution made says how many');
    t.equal(lines[5], '    payer->>hub: a.c x3 (1 answered)', 'and how many were answered');
    t.equal(lines[6], '    payer->>hub: a.d', 'the usual shape says nothing, for readability');
    t.end();
});

t.test('a call nothing answered crosses rather than points', t => {
    const model = modelOfObservations([observed('payer.b', 'payer', {to: 'hub'})]);
    t.match(
        renderSequence(model),
        /payer--xhub: payer\.b \(no receipt\)/,
        'crossed, and it says why',
    );
    t.end();
});

t.test('a call only its receiver shows is drawn as a note, not an arrow', t => {
    const model = modelOfObservations([observed('a.b', 'hub', {notes: ['withheld: liquidity']})]);
    t.equal(
        renderSequence(model),
        'sequenceDiagram\n' +
            '    autonumber\n' +
            '    participant hub\n' +
            '    Note over hub: withheld: liquidity\n' +
            '    Note over hub: a.b — received, no caller was observed\n',
        'the service, its notes, and the call it carried with nobody named as the caller',
    );
    t.end();
});

t.test('a note cannot carry a statement separator or a line break into the diagram', t => {
    // The `;` defect shipped once: mermaid reads it as a statement separator, so a
    // label carrying one turns one statement into two. Every string here comes from a
    // process this one does not control, so the rule is enforced, not trusted.
    const model = modelOfObservations([
        observed('payer.quote.rates', 'payer', {
            to: 'hub',
            notes: ['decision: accept;\nNote over hub: forged;\r\n'],
        }),
    ]);
    const rendered = renderSequence(model);
    t.notMatch(rendered, /;/, 'no statement separator survives');
    t.equal(rendered.trimEnd().split('\n').length, 6, 'and no label became two lines');
    t.match(
        rendered,
        /Note over payer: decision: accept Note over hub: forged/,
        'the text is kept, flattened',
    );
    t.end();
});

t.test('a hostile name cannot become an arrow', t => {
    // The caller and the receiver are read off the call, and both arrive from a store the
    // renderer did not validate (the local inspector reads records back, and a model can be
    // assembled by hand), so the diagram has to fold them itself: a name carrying `;`, `->>`
    // or `:` would close the statement and draw an arrow of its own. The names are drawn —
    // they are who was called — but what they must not do is become syntax.
    const model = modelOfObservations([
        observed('evil;x.payer', 'payer', {to: 'hub;x->>y', seq: '1'}),
    ]);
    const rendered = renderSequence(model);
    t.notMatch(rendered, /;/, 'the separator is gone from the participant names too');
    t.match(rendered, /participant evil_x/, 'the caller read off the id is folded to underscores');
    t.match(rendered, /participant hub_x-__y/, 'on both ends');
    t.match(
        rendered,
        /evil_x--xhub_x-__y: evil x.payer \(no receipt\)/,
        'exactly the one arrow the model asked for',
    );
    t.end();
});

t.test('a hostile declared caller is folded, not drawn as syntax', t => {
    // The folding is what keeps a caller-controlled name from becoming syntax. A caller
    // arrives in an identity, and the ledger declines one the grammar rejects; the renderer
    // folds whatever it is handed anyway, because a name that became a statement separator
    // would corrupt the diagram it was drawn in rather than appear wrong in it.
    const model = modelOfObservations([
        observed('single', 'payer', {
            from: 'evil;\npayer->>victim: forged',
            to: 'hub',
            seq: '1',
        }),
    ]);
    const rendered = renderSequence(model);
    t.notMatch(rendered, /;/, 'no statement separator survives');
    t.match(rendered, /participant evil__payer-__victim__forged/, 'folded to underscores');
    t.match(
        rendered,
        /evil__payer-__victim__forged--xhub: single/,
        'and drawn on the arrow — unanswered, since nothing declared an answer',
    );
    t.end();
});

t.test('two caller names that fold to the same name are numbered apart, not merged', t => {
    // `a b` and `a_b` are two names, not one with a typo, so the second is numbered
    // rather than drawn as the first. The third collides with a name already numbered,
    // so the suffix itself is tried again until it is free. The names are the callers the
    // identities declare — the one thing an arrow's source is read from.
    const model = modelOfObservations([
        observed('one', 'payer', {from: 'a b', to: 'c d', seq: '1'}),
        observed('two', 'payer', {from: 'a_b_2', to: 'c d', seq: '2'}),
        observed('three', 'payer', {from: 'a_b', to: 'c_d', seq: '3'}),
    ]);
    const names = renderSequence(model)
        .split('\n')
        .filter(line => line.startsWith('    participant'))
        .map(line => line.slice(4));
    t.same(
        names,
        [
            'participant a_b',
            'participant c_d',
            'participant a_b_2',
            'participant a_b_3',
            'participant c_d_2',
        ],
        'a name already taken is numbered, and a number already taken is tried again',
    );
    t.end();
});

t.test('a nameless record still takes part, as the receiver it reported itself to be', t => {
    // A record's service is who wrote it, and a name empty enough to fold to nothing is
    // drawn as `unobserved` rather than dropped: it is the only thing a receipt has to say
    // about its end of the call. It is not what an arrow is drawn from — the caller is.
    const model = modelOfObservations([observed('single', '', {seq: '1'})]);
    t.match(renderSequence(model), /participant unobserved\n/, 'a name cannot be empty either');
    const declared = modelOfObservations([observed('single', '', {from: 'payer', to: 'hub'})]);
    t.match(
        renderSequence(declared),
        /payer--xhub: single/,
        'and a declaration is drawn from the caller it named, not from the writer',
    );
    t.end();
});

t.test('an empty model renders a diagram with nothing in it', t => {
    t.equal(
        renderSequence({services: [], items: []}),
        'sequenceDiagram\n    autonumber\n',
        'the header, and no participant invented for it',
    );
    t.end();
});

t.test('the same model renders the same text, and layout cannot change it', t => {
    // Determinism is what lets the generated artifact be compared with the docs page
    // verbatim: no clock, no map iteration order, no arrival order.
    const observations = [
        observed('payer.quote.rates', 'payer', {to: 'hub', seq: '2', step: 'quote'}),
        observed('payer.discovery.parties', 'payer', {to: 'hub', seq: '1', step: 'discovery'}),
    ];
    const first = renderSequence(modelOfObservations(observations));
    const again = renderSequence(modelOfObservations([...observations].reverse()));
    t.equal(first, again, 'arrival order is not part of the output');
    t.equal(renderSequence(modelOfObservations(observations)), first, 'and neither is the clock');
    t.end();
});

t.test('a participant a model declares and no item names is still declared first', t => {
    // The model is public and the renderer is total: an undeclared participant would
    // be a mermaid name mermaid invents, in an order the model did not choose. The
    // builders take their participants from the calls, so a model that declares one is
    // built by hand — which is what this does.
    const model = modelOfObservations([observed('payer.b', 'payer', {to: 'hub'})]);
    const declared = (source: {services: string[]; items: DiagramItem[]}): string[] =>
        renderSequence(source)
            .split('\n')
            .filter(line => line.startsWith('    participant'))
            .map(line => line.slice(4));
    t.same(
        declared({services: ['payee'], items: [...model.items]}),
        ['participant payee', 'participant payer', 'participant hub'],
        'the declared order first, then whoever the items name',
    );
    t.same(
        declared(model),
        ['participant payer', 'participant hub'],
        'and a model the builders produced declares the units its call names',
    );
    t.end();
});
