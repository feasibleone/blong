/**
 * Capabilities: the switch, the marker that carries it, and the call channel it
 * switches.
 *
 * The interesting properties are the ones a per-flow decision needs — inheritance
 * into everything the scope does, an explicit "off" that survives a round trip,
 * tolerance of a marker another process wrote, and *no work at all* where the
 * answer is no.
 */
import t from 'tap';
import {
    callPhaseMessage,
    CALLS_CAPABILITY,
    createCallChannel,
    type CallEvent,
} from './capability.ts';
import {capabilityState, currentCapabilities, enterCapability, withCapability} from './context.ts';
import {
    decodeCapabilities,
    encodeCapabilities,
    identityHeaders,
    readIdentities,
    TRACE_HEADER,
    withoutCapabilities,
} from './propagation.ts';

t.test('the receiver answers with a phase of its own', t => {
    // The receipt says the receiver has the leg; the answer says what its handler did with it,
    // and it is the only record a realm handler's progress can ride (PRD R26/R27).
    const events: CallEvent[] = [];
    const channel = createCallChannel(event => void events.push(event));
    withCapability('calls', true, () => {
        channel.received('gateway.bundle.merge');
        channel.answered('gateway.bundle.merge', {progress: {points: ['merge-merged']}});
    });
    t.same(
        events.map(event => [event.phase, event.fields?.progress]),
        [
            ['received', undefined],
            ['answered', {points: ['merge-merged']}],
        ],
        'the two receiver phases are distinct, and the answer carries what the caller passed',
    );
    t.equal(
        callPhaseMessage('answered', 'gateway.bundle.merge'),
        'call answered: gateway.bundle.merge',
        'and the line names the leg like every other phase',
    );
    t.end();
});

t.test('a capability is inherited by everything the scope does', t => {
    t.equal(capabilityState('calls'), undefined, 'nothing decides it outside any scope');
    withCapability('calls', true, () => {
        t.equal(capabilityState('calls'), true, 'and the scope reads its own decision');
        t.same(currentCapabilities(), {calls: true}, 'the set is readable for publishing');
        withCapability('calls', false, () => {
            t.equal(capabilityState('calls'), false, 'a nested scope may override it');
        });
        t.equal(capabilityState('calls'), true, 'and the override does not outlive its scope');
    });
    enterCapability('calls', true);
    t.equal(capabilityState('calls'), true, 'the hook form decides for what follows');
    enterCapability('calls', false);
    t.equal(capabilityState('calls'), false, 'and can be revised');
    t.end();
});

t.test('one capability does not disturb another', t => {
    withCapability('calls', true, () => {
        withCapability('payloads', false, () => {
            t.same(currentCapabilities(), {calls: true, payloads: false});
            withCapability('calls', false, () => {
                t.same(
                    currentCapabilities(),
                    {calls: false, payloads: false},
                    'the nested decision leaves the sibling alone',
                );
            });
            t.equal(capabilityState('payloads'), false, 'and both are still decided after it');
        });
    });
    t.end();
});

t.test('the marker round-trips through the header, both directions', t => {
    withCapability('calls', true, () => {
        withCapability('payloads', false, () => {
            const headers = identityHeaders();
            t.match(headers[TRACE_HEADER], /cap=calls\.-payloads/, 'the decision is published');
            const inbound = readIdentities(headers);
            t.same(
                inbound.capabilities,
                {calls: true, payloads: false},
                'and read back as what it was: an explicit off is not a missing name',
            );
        });
    });
    t.end();
});

t.test('the marker is sorted, so two processes write the same text', t => {
    t.equal(encodeCapabilities({payloads: false, calls: true}), 'calls.-payloads');
    t.equal(encodeCapabilities({}), '', 'nothing decided is nothing written');
    t.end();
});

t.test('a marker from another process is read tolerantly', t => {
    t.same(decodeCapabilities('calls'), {calls: true});
    t.same(decodeCapabilities('-calls'), {calls: false});
    t.same(
        decodeCapabilities(' calls . -payloads '),
        {calls: true, payloads: false},
        'spaces are trimmed',
    );
    t.same(decodeCapabilities('calls.calls'), {calls: true}, 'a repeated name is read once');
    t.equal(decodeCapabilities(''), undefined, 'an empty value decides nothing');
    t.same(
        decodeCapabilities('calls..payloads'),
        {calls: true, payloads: true},
        'a stray separator is skipped, not fatal',
    );
    t.equal(decodeCapabilities('-'), undefined, 'a negation of nothing decides nothing');
    t.equal(decodeCapabilities('-.'), undefined, 'and neither does a list of empty names');
    // A malformed field is dropped rather than failing the call it arrived with.
    t.equal(readIdentities({[TRACE_HEADER]: 'trace=tr-1,cap='}).capabilities, undefined);
    t.equal(readIdentities({[TRACE_HEADER]: 'trace=tr-1,cap=calls'}).capabilities?.calls, true);
    t.equal(
        readIdentities({[TRACE_HEADER]: 'trace=tr-1,cap=calls.-payloads'}).trace,
        'tr-1',
        'the rest of the identity is unaffected',
    );
    t.end();
});

t.test('the capability field can be stripped off an inbound header value', t => {
    t.equal(
        withoutCapabilities('trace=tr-1,flow=01ARZ3NDEKTSV4RRFFQ69G5FAV,cap=calls.-payloads'),
        'trace=tr-1,flow=01ARZ3NDEKTSV4RRFFQ69G5FAV',
        'the identity is left exactly as it arrived',
    );
    t.equal(withoutCapabilities('trace=tr-1'), 'trace=tr-1', 'a value with no field is unchanged');
    t.equal(withoutCapabilities(''), '', 'and an absent one is empty rather than undefined');
    t.end();
});

t.test('the call channel asks the switch once per call', t => {
    const events: CallEvent[] = [];
    const calls = createCallChannel(event => events.push(event));
    t.equal(calls.enabled(), false, 'nothing decided means nothing recorded');
    calls.start('a.b');
    calls.end('a.b');
    calls.error('a.b', new Error('boom'));
    calls.received('a.b');
    t.same(events, [], 'and no event reaches the writer at all');

    withCapability(CALLS_CAPABILITY, true, () => {
        t.equal(calls.enabled(), true);
        calls.start('a.b', {note: 'x'});
        calls.end('a.b');
        calls.end('a.b', {note: 'x'});
        calls.error('a.b', new Error('boom'));
        calls.error('a.b', new Error('boom'), {note: 'x'});
        calls.error('a.b', undefined, {note: 'x'});
        calls.received('a.b');
        calls.received('a.b', {note: 'x'});
        calls.error('a.b');
    });

    t.same(
        events.map(event => [event.phase, event.leg]),
        [
            ['start', 'a.b'],
            ['end', 'a.b'],
            ['end', 'a.b'],
            ['error', 'a.b'],
            ['error', 'a.b'],
            ['error', 'a.b'],
            ['received', 'a.b'],
            ['received', 'a.b'],
            ['error', 'a.b'],
        ],
        'each phase arrives with the leg it belongs to',
    );
    t.same(events[0].fields, {note: 'x'}, 'a caller may add fields of its own');
    t.equal(events[0].message, 'call start: a.b', 'and the channel writes the line for the phase');
    t.equal(events[7].message, 'call received: a.b', 'including a receipt');
    t.same(events[2].fields, {note: 'x'}, 'a phase carries them as they were given');
    t.match(String(events[3].error), /boom/, 'the error rides the error phase');
    t.equal(events[4].fields?.note, 'x', 'and fields ride beside it');
    t.equal(events[5].error, undefined, 'the error is simply absent when there is none');
    t.same(events[7].fields, {note: 'x'}, 'a receipt may carry fields too');
    t.equal(events[8].error, undefined, 'and the last call has nothing to report');
    t.end();
});

t.test('an opted-out call is dropped inside the scope too', t => {
    const events: CallEvent[] = [];
    const calls = createCallChannel(event => events.push(event));
    withCapability(CALLS_CAPABILITY, true, () => {
        calls.start('a.b');
        withCapability(CALLS_CAPABILITY, false, () => {
            calls.start('a.b');
        });
        calls.end('a.b');
    });
    t.same(
        events.map(event => event.phase),
        ['start', 'end'],
        'the nested opt-out writes nothing of its own',
    );
    t.end();
});

t.test('a phase line names the phase and the leg', t => {
    t.equal(callPhaseMessage('start', 'gateway.access.find'), 'call start: gateway.access.find');
    t.equal(callPhaseMessage('end', 'a.b'), 'call end: a.b');
    t.equal(callPhaseMessage('error', 'a.b'), 'call error: a.b');
    t.equal(callPhaseMessage('received', 'a.b'), 'call received: a.b');
    t.end();
});
