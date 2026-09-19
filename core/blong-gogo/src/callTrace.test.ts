/**
 * The framework's half of call recording: the configuration it falls back to, the
 * envelope a record carries, and the name a capability is asked for by.
 *
 * The switch itself and the phases are semantic-log's (`src/capability.ts`
 * there), and the two are pinned together here rather than left to agree by
 * convention — a capability name that drifted between packages would silence the
 * channel without failing anything.
 */
import {CALLS_CAPABILITY as SEMANTIC_CALLS_CAPABILITY} from '@feasibleone/semantic-log/capability';
import t from 'tap';
import {
    CALLS_CAPABILITY,
    callRecord,
    callTraceConfig,
    callsPermitted,
    configureCallTrace,
} from './callTrace.ts';

t.teardown(() => configureCallTrace(undefined));

t.test('the capability name is the one semantic-log asks for', t => {
    t.equal(CALLS_CAPABILITY, SEMANTIC_CALLS_CAPABILITY);
    t.end();
});

t.test('the default is to record', t => {
    configureCallTrace(undefined);
    t.equal(callsPermitted('access.access.find'), true, 'nothing configured records');
    t.same(callTraceConfig(), {}, 'and the configuration in force says so');
    t.end();
});

t.test('an off pattern names a flow, and matches a namespace or an exact method', t => {
    configureCallTrace({off: ['payment', 'ledger.entry.post']});
    t.equal(callsPermitted('payment.transfer.prepare'), false, 'a namespace is opted out');
    t.equal(callsPermitted('ledger.entry.post'), false, 'an exact entry is opted out');
    t.equal(callsPermitted('ledger.entry.other'), true, 'a sibling of the exact entry is not');
    t.equal(callsPermitted('access.access.find'), true, 'an unrelated flow is untouched');
    t.end();
});

t.test('a glob pattern opts out a whole prefix', t => {
    configureCallTrace({off: ['payment.*']});
    t.equal(callsPermitted('payment.transfer.prepare'), false);
    t.equal(callsPermitted('payment'), false, 'the namespace itself matches the pattern');
    t.equal(callsPermitted('payments.transfer.prepare'), true, 'a longer name is not a match');
    t.end();
});

t.test('enabled false is the blunt switch', t => {
    configureCallTrace({enabled: false, off: ['access']});
    t.equal(callsPermitted('access.access.find'), false);
    t.equal(callsPermitted('anything.else'), false, 'and it is not limited to the patterns');
    t.end();
});

t.test('a single off flag is read as a list, because the CLI writes one', t => {
    // `--log.calls.off=payment` arrives as a string and the same flag twice as an
    // array; a configuration that only worked when it was repeated would be a trap.
    configureCallTrace({off: 'payment' as unknown as string[]});
    t.equal(callsPermitted('payment.transfer.prepare'), false);
    t.same(callTraceConfig().off, ['payment'], 'and it is normalised to a list');
    t.end();
});

t.test('a phase record keeps the shape the ledger reads a leg from', t => {
    t.same(callRecord('gateway.access.access.find', 'start'), {
        $meta: {mtid: 'event', method: 'gateway.access.access.find.start'},
    });
    t.same(callRecord('a.b', 'received'), {$meta: {mtid: 'event', method: 'a.b.received'}});
    t.end();
});

t.test('the stdout opt-in is read by the log implementation, not here', t => {
    configureCallTrace({stdout: true});
    t.equal(callTraceConfig().stdout, true, 'the framework passes it through untouched');
    t.equal(callsPermitted('a.b'), true, 'and it says nothing about whether a flow records');
    t.end();
});
