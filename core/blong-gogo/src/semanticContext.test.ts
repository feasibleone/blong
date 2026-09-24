import type {IMeta} from '@feasibleone/blong/types';
import * as vocabulary from '@feasibleone/semantic-log/emitter';
import t from 'tap';
import {configureCallTrace} from './callTrace.ts';
import {
    adoptInbound,
    attachSemanticVocabulary,
    callsFor,
    capabilityOf,
    currentIdentity,
    decide,
    declareCall,
    enterCapability,
    enterRequestFlow,
    inboundIdentities,
    isFlowId,
    namespaceOf,
    point,
    runInFlow,
} from './semanticContext.ts';

// The framework reaches the emitter's vocabulary by attachment (the emitter's
// context is Node-only, and the browser bootstrap loads this module too), so a tap
// process attaches it exactly as `loadServer.ts` does.
attachSemanticVocabulary(vocabulary);
const {currentContext} = vocabulary;

/** The canonical example ULID — 26 characters, none of them I, L, O or U. */
const FLOW = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

/** An inbound `$meta` carrying the one header the emitter propagates on. */
function inbound(fields: string): IMeta {
    return {mtid: 'request', method: 'm', forward: {'x-semantic-trace': fields}};
}

t.test('the progress-point handles report through whichever vocabulary is attached', t => {
    // PRD R26: a realm or a bootstrap reaches these through this module rather than through the
    // emitter, so what they must be is the *façade's* functions — the ones that degrade when
    // nothing is attached (this module is on the browser's path too). With the vocabulary attached
    // above, the same calls reach the emitter itself.
    point('handler-created', {by: 'semanticContext.test'});
    t.same(
        vocabulary.takePoints(),
        [{name: 'handler-created', data: {by: 'semanticContext.test'}}],
        'a point reported here is taken by the attached vocabulary',
    );
    const chosen = decide('route', {}, [
        {name: 'a', when: () => false, run: () => 'a'},
        {name: 'b', when: () => true, run: () => 'b'},
    ]);
    t.equal(chosen, 'b', 'and a branch taken here still selects');
    t.equal(
        vocabulary.takeDecision()?.chosen,
        'b',
        'while its rationale reaches the vocabulary too',
    );
    t.end();
});

t.test('a request enters its flow before the hooks that may reject it', async t => {
    // The enter-style entry. A gateway request is decided in two phases with a
    // framework boundary between them: the auth and metering hooks run before the
    // route handler, so a call they reject never reaches code that mints a flow —
    // which is exactly the call the observed picture could not show (T-105).
    await (async () => {
        const published = enterRequestFlow({}, 'access.role.find');
        t.equal(isFlowId(currentContext().flow?.id), true, 'a flow is minted and entered');
        t.equal(
            currentContext().flow?.kind,
            'access.role.find',
            'named for the path it arrived on',
        );
        t.equal(
            published['x-semantic-trace']?.includes(`flow=${currentContext().flow?.id ?? ''}`),
            true,
            'and published on the request, so the route handler adopts this same flow',
        );
    })();
    await (async () => {
        const published = enterRequestFlow(
            {'x-semantic-trace': `trace=tr-1,flow=${FLOW}`},
            'access.role.find',
        );
        t.equal(currentContext().flow?.id, FLOW, 'a carried flow is adopted rather than replaced');
        t.equal(currentContext().flow?.kind, 'access.role.find', 'and named by this hop');
        t.equal(
            published['x-semantic-trace']?.includes('trace=tr-1'),
            true,
            'the trace it arrived with travels on',
        );
    })();
    await (async () => {
        enterRequestFlow({}, '');
        t.equal(
            currentContext().flow?.kind,
            'unlabelled',
            'an entry that names no method is unlabelled, not guessed at',
        );
    })();
});

t.test('a flow id is a ULID and nothing else', t => {
    t.equal(isFlowId(FLOW), true, 'an execution id is a flow');
    t.equal(isFlowId(undefined), false, 'an absent execution is not one');
    t.equal(isFlowId('nope'), false, 'and neither is a word');
    t.equal(
        isFlowId('01ARZ3NDEKTSV4RRFFQ69G5FAI'),
        false,
        'a character outside the alphabet is not one either',
    );
    t.end();
});

t.test('identity is read off the forwarded header bag', t => {
    t.same(inboundIdentities(undefined), {}, 'a call with no meta carries nothing');
    t.same(
        inboundIdentities({mtid: 'request', method: 'm'}),
        {},
        'and so does one with no forward block',
    );
    t.same(
        inboundIdentities(
            inbound(
                `trace=tr-1,flow=${FLOW},leg=party.subject.find,from=access.db,to=party,seq=1.2`,
            ),
        ),
        {
            trace: 'tr-1',
            flow: FLOW,
            leg: 'party.subject.find',
            from: 'access.db',
            to: 'party',
            seq: '1.2',
        },
        'a full set is read back out',
    );
    t.end();
});

t.test('a leg is the method, and the caller travels beside it', t => {
    // The method is what a diagram labels the arrow with, so it is the leg id verbatim -
    // including a forwarded hop's slash (`db/party.subject.find`), which is the name the
    // callee strips back to. The caller is its own identity: repeating it in the label said
    // what the arrow already said, and the two are read for different things (D-249).
    t.equal(namespaceOf('party.subject.find'), 'party', 'the method names the unit it reaches');
    t.equal(
        namespaceOf('db/party.subject.find'),
        'db',
        'and a forwarded hop names the one it forwards to',
    );
    t.equal(
        vocabulary.isLegId('db/party.subject.find'),
        true,
        'a forwarded hop is a lawful leg id',
    );
    t.equal(
        vocabulary.isServiceName('access.db'),
        true,
        'and a caller is named by the same grammar',
    );
    t.equal(vocabulary.isServiceName('access/db'), false, 'without the slash a method may carry');
    t.end();
});

t.test('a participant is the first segment of the method', t => {
    t.equal(
        namespaceOf('party.subject.find'),
        'party',
        'a dotted method names its namespace first',
    );
    t.equal(namespaceOf('db/party.subject.find'), 'db', 'and so does a rewritten destination');
    t.equal(namespaceOf('party'), 'party', 'a method in the root namespace is its own');
    t.end();
});

t.test('an outermost entry mints a flow and publishes it for the calls inside it', t => {
    const meta: IMeta = {mtid: 'request', method: 'access.user.find'};
    const seen = runInFlow(meta, 'access.user.find', () => ({
        context: currentContext(),
        identity: currentIdentity(),
    }));
    t.equal(isFlowId(seen.identity.flow), true, 'the entry has an execution id');
    t.equal(
        seen.context.flow?.kind,
        'access.user.find',
        'whose kind is the method it was addressed to',
    );
    t.equal(typeof seen.context.trace, 'string', 'and it is correlated by a trace');
    t.equal(seen.identity.leg, undefined, 'the entry itself is not a call, so it declares no leg');
    t.match(
        meta.forward?.['x-semantic-trace'] ?? '',
        new RegExp(`flow=${seen.identity.flow}`),
        'and the header rides on the meta a callee will be handed',
    );
    const outside = runInFlow({mtid: 'request', method: 'm'}, 'm', () => currentIdentity().flow);
    t.not(outside, seen.identity.flow, 'two entries are two executions');
    t.end();
});

t.test('a trace handed to the entry is reused rather than replaced', t => {
    const meta: IMeta = {mtid: 'request', method: 'm', forward: {'x-b3-traceid': 'tr-9'}};
    t.equal(
        runInFlow(meta, 'm', () => currentContext().trace),
        'tr-9',
        'the correlation the framework has always minted is the one the entry runs on',
    );
    t.end();
});

t.test('a B3 trace that cannot be used is minted instead', t => {
    const empty = {mtid: 'request', method: 'm', forward: {'x-b3-traceid': ''}} as IMeta;
    const wrongType = {
        mtid: 'request',
        method: 'm',
        forward: {'x-b3-traceid': 42},
    } as unknown as IMeta;
    t.not(
        runInFlow(empty, 'm', () => currentContext().trace),
        '',
        'an empty trace is not a trace',
    );
    t.not(
        runInFlow(wrongType, 'm', () => currentContext().trace),
        42,
        'nor is one that is not a string',
    );
    t.end();
});

t.test('an entry that cannot name itself is still held by a typed flow', t => {
    t.equal(
        runInFlow({mtid: 'request', method: ''}, '', () => currentContext().flow?.kind),
        'unlabelled',
        'a flow needs a kind, so an entry with no name gets a placeholder one',
    );
    t.end();
});

t.test('an inbound call joins the flow it was made in', t => {
    const seen = adoptInbound(
        inbound(`trace=tr-1,flow=${FLOW},leg=payer.quote.rates,to=hub,seq=1.2`),
        'hub.quote.rates',
        () => ({context: currentContext(), identity: currentIdentity()}),
    );
    t.equal(seen.identity.flow, FLOW, "the caller's execution is adopted");
    t.equal(seen.identity.leg, 'payer.quote.rates', 'and the call it made');
    t.equal(seen.identity.seq, '1.2', 'and where that call sits in the execution');
    t.equal(
        seen.context.flow?.kind,
        'hub.quote.rates',
        'while the kind is the method this side was addressed to',
    );
    t.end();
});

t.test('an inbound call carrying no identity is an outermost entry', t => {
    const meta: IMeta = {mtid: 'request', method: 'party.subject.find'};
    const flow = adoptInbound(meta, 'party.subject.find', () => currentIdentity().flow);
    t.equal(isFlowId(flow), true, 'a peer that names no flow gets a flow of its own');
    t.equal(
        adoptInbound(meta, '', () => currentContext().flow?.kind),
        'unlabelled',
        'and a peer that names nothing at all still gets a held execution',
    );
    t.end();
});

t.test('an inbound identity the grammar refuses is dropped, never repaired', t => {
    const badSeq = adoptInbound(inbound(`flow=${FLOW},leg=payer.quote.rates,seq=1.`), 'm', () =>
        currentIdentity(),
    );
    t.equal(badSeq.leg, 'payer.quote.rates', 'a lawful leg is adopted');
    t.equal(
        badSeq.seq,
        undefined,
        'but a position that is not one is left out rather than guessed',
    );

    const badLeg = adoptInbound(inbound(`flow=${FLOW},leg=!`), 'm', () => currentIdentity());
    t.equal(badLeg.flow, FLOW, 'the execution is still adopted');
    t.equal(badLeg.leg, undefined, 'while a call site the grammar cannot hold is not');

    const noTrace = adoptInbound(inbound(`flow=${FLOW}`), 'm', () => currentContext().trace);
    t.equal(typeof noTrace, 'string', 'and an execution arriving without a trace is given one');
    t.end();
});

t.test('a call made outside any flow is not declared', t => {
    const meta: IMeta = {mtid: 'request', method: 'm'};
    t.equal(
        declareCall('access.db', 'party.subject.find', () => 'ran', meta),
        'ran',
        'the call still runs',
    );
    t.equal(meta.forward, undefined, 'and nothing is published onto a meta no flow holds');
    t.end();
});

t.test('a call inside a flow is named by its method, with the caller beside it', t => {
    const meta: IMeta = {mtid: 'request', method: 'access.user.find'};
    // Read the scope from inside the declaration: the leg only exists while the
    // call it names is being made.
    const seen = runInFlow(meta, 'access.user.find', () =>
        declareCall(
            'access.db',
            'party.subject.find',
            () => ({context: currentContext(), identity: currentIdentity()}),
            meta,
        ),
    );
    t.equal(
        seen.identity.leg,
        'party.subject.find',
        'the leg is the method the call is made by — what a diagram labels the arrow with',
    );
    t.equal(
        seen.context.legFrom,
        'access.db',
        'and the unit that made it is its own identity, not part of the label',
    );
    t.match(String(seen.identity.seq), /^[0-9]+$/, 'and takes the first position in the caller');
    t.equal(
        seen.context.legTo,
        'party',
        'aimed at the namespace the callee will derive for itself',
    );
    t.match(
        meta.forward?.['x-semantic-trace'] ?? '',
        /leg=party\.subject\.find,from=access\.db,to=party/,
        'and the callee is handed the call it is part of, both ends stated',
    );
    t.end();
});

t.test('a call declared without a meta still binds the caller scope', t => {
    const meta: IMeta = {mtid: 'request', method: 'm'};
    const leg = runInFlow(meta, 'm', () =>
        declareCall('access.db', 'party.subject.find', () => currentIdentity().leg),
    );
    t.equal(
        leg,
        'party.subject.find',
        'the leg is bound whether or not there is a meta to publish on',
    );
    t.end();
});

t.test('a call the grammar cannot name runs unnamed instead of failing', t => {
    const meta: IMeta = {mtid: 'request', method: 'm'};
    const seen = runInFlow(meta, 'm', () => ({
        namelessId: declareCall('', '', () => currentIdentity().leg),
        namelessTarget: declareCall('a', '!x', () => currentIdentity().leg),
    }));
    t.equal(seen.namelessId, undefined, 'a port and method that flatten to nothing are not a leg');
    t.equal(seen.namelessTarget, undefined, 'nor is a call whose target is not a participant name');
    t.end();
});

t.test('the scope a caller is in can be asked about', t => {
    t.same(currentIdentity(), {}, 'outside a flow there is nothing to report');
    t.end();
});

t.test('a flow records calls unless something decided otherwise', t => {
    configureCallTrace(undefined);
    t.equal(
        callsFor(undefined, 'access.access.find'),
        true,
        'nothing decided and nothing configured',
    );
    configureCallTrace({enabled: false});
    t.equal(
        callsFor(undefined, 'access.access.find'),
        false,
        'the configuration can opt everything out',
    );
    configureCallTrace({off: ['payment']});
    t.equal(callsFor(undefined, 'payment.transfer.prepare'), false, 'or one entry');
    configureCallTrace(undefined);
    t.end();
});

t.test('a decision published with the identity outranks the local configuration', t => {
    // How a flow stays whole: the entry point decided, the decision travelled in
    // the `cap` field, and this process reads it instead of its own configuration —
    // otherwise one flow would be recorded in two halves.
    configureCallTrace({enabled: false});
    t.equal(
        callsFor(inbound(`flow=${FLOW},cap=calls`), 'anything.at.all'),
        true,
        'a flow the entry point asked for is recorded here too',
    );
    configureCallTrace({enabled: true});
    t.equal(
        callsFor(inbound(`flow=${FLOW},cap=-calls`), 'anything.at.all'),
        false,
        'and a flow it opted out of stays opted out',
    );
    configureCallTrace(undefined);
    t.end();
});

t.test('a grant decides the flow before the scope is minted', t => {
    configureCallTrace({off: ['payment']});
    enterCapability('calls', true);
    t.equal(capabilityOf('calls'), true, 'the boundary decision is readable');
    const entered = runInFlow(inbound(`flow=${FLOW}`), 'payment.transfer.prepare', () =>
        vocabulary.capabilityState('calls'),
    );
    t.equal(entered, true, 'and the scope keeps it rather than re-deciding from the configuration');
    t.end();
});
