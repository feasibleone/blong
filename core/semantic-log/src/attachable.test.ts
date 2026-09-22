import t from 'tap';
import * as emitter from '../emitter.ts';
import {attachSemanticVocabulary, detachSemanticVocabulary, vocabulary} from './attachable.ts';

// The facade exists so that code a browser also bundles can reach identity and
// capability: it imports nothing, and an unattached one answers "no identity"
// rather than throwing. Both halves are asserted, because the degradation is the
// contract a page relies on and the pass-through is the contract a server does.

const FLOW = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const LEG = 'gateway.party.partyFind';

t.test('unattached, every reader degrades and every scope still runs', async t => {
    detachSemanticVocabulary();

    t.same(vocabulary.readIdentities({flow: FLOW}), {}, 'an identity bag decodes to nothing');
    t.equal(vocabulary.isLegId(LEG), false, 'no leg grammar without the vocabulary');
    t.equal(vocabulary.isLegSeq('1'), false, 'no sequence grammar either');
    t.equal(vocabulary.isServiceName('db'), false, 'and no service names');
    t.same(vocabulary.identityHeaders(), {}, 'a call carries no identity');
    t.same(vocabulary.currentCapabilities(), {}, 'and no capability is decided');
    t.equal(vocabulary.capabilityState('calls.-payloads'), undefined, 'nothing is decided at all');
    t.same(vocabulary.currentContext(), {}, 'the scope is empty rather than absent');

    let ran = 0;
    t.equal(
        vocabulary.withFlow({id: FLOW, kind: 'party.party.find'}, () => {
            ran += 1;
            return 'done';
        }),
        'done',
        'a flow-scoped function still runs, unlabelled',
    );
    t.equal(
        vocabulary.bindTrace('abc', () => {
            ran += 1;
            return 'done';
        }),
        'done',
        'and so does a trace-scoped one',
    );
    t.equal(
        vocabulary.bindInboundLeg({id: LEG, seq: '1'}, () => {
            ran += 1;
            return 'done';
        }),
        'done',
        'and one scoped to an inbound leg',
    );
    t.equal(
        vocabulary.bindLeg({id: LEG, from: 'gateway', to: 'party'}, () => {
            ran += 1;
            return 'done';
        }),
        'done',
        'and one scoped to an outbound leg',
    );
    t.equal(
        vocabulary.withCapability('calls.-payloads', true, () => {
            ran += 1;
            return 'done';
        }),
        'done',
        'and one scoped to a capability',
    );
    t.equal(
        await vocabulary.step('gateway meter flow', () => {
            ran += 1;
            return 'done';
        }),
        'done',
        'and one scoped to a phase',
    );
    // The enter-style members have no scope to enter and no return value: what
    // matters is that calling them unattached is not an error.
    vocabulary.enterFlow({id: FLOW, kind: 'party.party.find'});
    vocabulary.enterTrace('abc');
    vocabulary.enterInboundLeg({id: LEG, seq: '1'});
    vocabulary.enterCapability('calls.-payloads', true);
    t.equal(ran, 6, 'every scope ran its function exactly once');
    t.end();
});

t.test('attached, the facade is the emitter vocabulary itself', async t => {
    attachSemanticVocabulary(emitter);
    t.teardown(() => detachSemanticVocabulary());

    t.equal(vocabulary.isLegId(LEG), true, 'leg ids are read by the real grammar');
    t.equal(vocabulary.isLegSeq('1'), true, 'and so are sequences');
    t.equal(vocabulary.isServiceName('party'), true, 'and service names');

    vocabulary.enterFlow({id: FLOW, kind: 'party.party.find'});
    t.equal(vocabulary.currentContext().flow?.id, FLOW, 'a flow is entered in the real scope');
    t.equal(
        vocabulary.readIdentities(vocabulary.identityHeaders()).flow,
        FLOW,
        'and the identity decodes as the emitter decodes it',
    );
    t.match(
        vocabulary.identityHeaders()['x-semantic-trace'] ?? '',
        /flow=/,
        'with the header to match',
    );

    vocabulary.enterCapability('calls.-payloads', true);
    t.equal(
        vocabulary.capabilityState('calls.-payloads'),
        true,
        'a capability is decided in scope',
    );
    t.same(vocabulary.currentCapabilities(), {'calls.-payloads': true}, 'and read back as a set');

    t.equal(
        await vocabulary.withCapability('calls.-payloads', false, async () => {
            await Promise.resolve();
            return vocabulary.capabilityState('calls.-payloads');
        }),
        false,
        'a capability-scoped region sees only its own answer',
    );
    t.equal(
        vocabulary.withFlow(
            {id: FLOW, kind: 'party.party.find'},
            () => vocabulary.currentContext().flow?.kind,
        ),
        'party.party.find',
        'a flow-scoped region is entered with the flow it named',
    );
    t.equal(
        vocabulary.bindTrace('trace-2', () => vocabulary.currentContext().trace),
        'trace-2',
        'and a trace-scoped region with its own trace',
    );
    t.equal(
        vocabulary.bindLeg({id: LEG, from: 'gateway', to: 'party'}, () =>
            /leg=/.test(vocabulary.identityHeaders()['x-semantic-trace'] ?? ''),
        ),
        true,
        'and a leg-scoped region names the leg it declared',
    );
    t.equal(
        vocabulary.bindInboundLeg({id: LEG, seq: '1'}, () => vocabulary.currentContext().leg),
        LEG,
        'an inbound leg is entered inside its own scope',
    );
    vocabulary.enterTrace('abc');
    t.equal(vocabulary.currentContext().trace, 'abc', 'and a trace too');
    vocabulary.enterInboundLeg({id: LEG, seq: '2'});
    t.equal(vocabulary.currentContext().leg, LEG, 'which the enter-style members share');
    t.equal(
        await vocabulary.step('gateway meter flow', () => vocabulary.currentContext().flow?.step),
        'gateway meter flow',
        'and a phase-scoped region is entered with the phase it named',
    );
});
