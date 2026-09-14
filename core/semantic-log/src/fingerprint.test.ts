import t from 'tap';
import {fingerprint, serializeForIdentity, withIdentity} from './fingerprint.ts';
import type {LogRecord} from './record.ts';
import {REF_LENGTH} from './refs.ts';

function record(overrides: Partial<LogRecord> = {}): LogRecord {
    return {
        id: '01J0000000000000000000000000',
        time: 1,
        level: 50,
        levelName: 'error',
        msg: 'Failed to persist chunk to secondary node',
        service: 'db-driver',
        refs: {record: '01J0000000000000000000000000'},
        ...overrides,
    };
}

t.test('serialization is a deterministic prefixed string', t => {
    t.equal(
        serializeForIdentity(record()),
        '[LEVEL: ERROR] [SERVICE: db-driver] [MSG: Failed to persist chunk to secondary node]',
    );
    t.end();
});

t.test('categorical detail and error context are appended', t => {
    const serialized = serializeForIdentity(
        record({
            context: 'pool',
            operation: 'transfer.create',
            err: {
                type: 'Error',
                message: 'Connection timeout after 30000ms',
                stack: 'Error: t\n    at f (/app/a.ts:1:2)',
            },
        }),
    );
    t.match(serialized, /\[CONTEXT: pool\]/);
    t.match(serialized, /\[OP: transfer\.create\]/);
    t.match(serialized, /\[ERR: Error\]/);
    t.match(serialized, /\[ERR_MSG: Connection timeout after <NUM>ms\]/);
    t.end();
});

t.test('two executions differing only in variable values share a fingerprint', t => {
    const a = fingerprint(record({msg: 'transfer 1001 failed'}));
    const b = fingerprint(record({msg: 'transfer 9876 failed'}));
    t.equal(a, b, 'PRD R3 acceptance: identity comes from structure, not values');
    t.end();
});

t.test('a different operation is a different identity', t => {
    t.not(fingerprint(record()), fingerprint(record({msg: 'Something else entirely'})));
    t.end();
});

t.test('a decision serializes as its discriminator, chosen branch and candidates', t => {
    const decision = {
        discriminator: 'pool.selection',
        candidates: ['primary', 'secondary'],
        chosen: 'secondary',
        values: {latencyMs: 12, healthy: false},
    };
    t.equal(
        serializeForIdentity(record({context: 'router', decision})),
        '[LEVEL: ERROR] [SERVICE: db-driver] [CONTEXT: router] [MSG: Failed to persist chunk to secondary node] [DECISION: pool.selection=secondary] [CANDIDATES: primary,secondary]',
    );
    t.not(
        fingerprint(record({decision})),
        fingerprint(record({decision: {...decision, chosen: 'primary'}})),
        'PRD R12: the taken branch is part of the identity',
    );
    t.end();
});

t.test('withIdentity fills fingerprint, template and the template reference without mutating the input', t => {
    const input = record();
    const out = withIdentity(input);
    t.equal(input.fingerprint, undefined, 'input untouched');
    t.equal(out.fingerprint, fingerprint(input));
    t.equal(out.template, serializeForIdentity(input));
    t.equal(out.refs.template, fingerprint(input).slice(0, REF_LENGTH), 'PRD R19/R12: the template reference is minted locally');
    t.end();
});

t.test('a redaction-collapsed decision cannot break identity minting', t => {
    // Redaction runs before identity is minted, and a `redact` pattern
    // (`decision`, `**`) can replace the whole slot with the placeholder string.
    // The declared type still says `Decision`, so the guard is on the runtime
    // value: minting must stay total rather than throw out of `logger.info`.
    const decision = {
        discriminator: 'pool.selection',
        candidates: ['primary', 'secondary'],
        chosen: 'secondary',
        values: {latencyMs: 12},
    };
    const collapsed = record({decision: '[redacted]' as unknown as LogRecord['decision']});
    t.doesNotThrow(() => serializeForIdentity(collapsed), 'a collapsed slot is tolerated');
    t.notMatch(
        serializeForIdentity(collapsed),
        /\[DECISION:|\[CANDIDATES:/,
        'a withheld rationale contributes nothing to the identity',
    );
    // `decision.candidates` collapses only the array, leaving the rest intact.
    const noCandidates = record({decision: {...decision, candidates: '[redacted]' as unknown as string[]}});
    t.doesNotThrow(() => serializeForIdentity(noCandidates), 'a collapsed candidate list is tolerated');
    t.match(serializeForIdentity(noCandidates), /\[DECISION: pool\.selection=secondary\]/, 'the rest still contributes');
    t.notMatch(serializeForIdentity(noCandidates), /\[CANDIDATES:/, 'the collapsed list is omitted');
    t.end();
});
