/**
 * Reading a record, and drawing a frame.
 *
 * The accessors are the one place that knows where lukaot puts each fact, so the cases pinned here are
 * the shapes the framework actually writes: a declared signal (the identifier is promoted to the top
 * level *and* left in the fields), a capture (its shape's fields and its payload live in `fields`), and
 * a port failure (the error is top level, the type is a field). The frame cases are the rendering rules
 * a reader checks against a hex editor (`@@D-926` `@@D-927`).
 */

import {test} from 'tap';

import {
    bytesOfHex,
    captureOf,
    contextOf,
    decisionOf,
    exchangeOf,
    flowOf,
    hexDump,
    intentOf,
    paramsOf,
    parentOf,
    serviceOf,
    signalOf,
    traceOf,
} from './record.ts';
import type {LogEntry} from './types.ts';

/** A line as the framework writes it, with the members a case cares about. */
const record = (extra: Record<string, unknown>): LogEntry =>
    ({
        id: '01M7WBYA07S5FPE05QSXRMKC59',
        time: 1795174639624,
        level: 30,
        levelName: 'info',
        msg: 'generating dir /tmp/x',
        service: 'blong',
        version: '0.1.0',
        ...extra,
    }) as LogEntry;

test('a declared signal carries its identifier at the top level and its values in the fields', async t => {
    const signal = record({
        signal: 'frameworkSchemaFileRewritten',
        fields: {
            context: 'ApiSchema',
            signal: 'frameworkSchemaFileRewritten',
            params: {file: '/tmp/x.ts'},
        },
    });
    t.equal(signalOf(signal), 'frameworkSchemaFileRewritten', 'the identifier is found');
    t.equal(contextOf(signal), 'ApiSchema', 'and the component that reported it');
    t.equal(serviceOf(signal), 'blong', 'the service is the process, not the component');
    t.same(paramsOf(signal), {file: '/tmp/x.ts'}, 'the values a reader wants beside the sentence');
    t.end();
});

test('a line with no identifier answers none rather than a placeholder', async t => {
    t.equal(signalOf(record({})), undefined);
    t.equal(contextOf(record({})), undefined);
    t.equal(paramsOf(record({})), undefined);
    t.equal(captureOf(record({})), undefined, 'and an ordinary line carries no capture');
    t.end();
});

test('an entry written before the conversion still names its service', async t => {
    const {service: _service, ...legacy} = record({name: 'gateway'});
    t.equal(
        serviceOf(legacy as LogEntry),
        'gateway',
        'the pino-era spelling is read as a fallback',
    );
    t.end();
});

test('a capture is recognised by its declaration, and keeps the fields its shape rendered', async t => {
    const frame = record({
        msg: 'tcp frame',
        fields: {
            context: 'srv.tcp',
            capture: 'frameworkTcpFrame',
            shape: 'tcp.frame',
            rung: 'full',
            bytes: 18,
            direction: 'out',
            ascii: '....',
            payload: 'ff d8 ff db 00 84 00 06 04 05 06 05 06 04 06 05',
        },
    });
    const capture = captureOf(frame);
    t.equal(capture?.signal, 'frameworkTcpFrame');
    t.equal(capture?.shape, 'tcp.frame');
    t.equal(capture?.rung, 'full');
    t.equal(capture?.bytes, 18);
    t.equal(capture?.fields['direction'], 'out');
    t.match(String(capture?.payload), /^ff d8/, 'and the payload it was rendered to');
    t.end();
});

test('a line at the line rung carries no payload, and says which rung it stopped at', async t => {
    const capture = captureOf(
        record({
            fields: {
                context: 'srv.tcp',
                capture: 'frameworkTcpFrame',
                shape: 'tcp.frame',
                rung: 'line',
                bytes: 2,
                direction: 'out',
            },
        }),
    );
    t.equal(capture?.rung, 'line');
    t.equal(capture?.payload, undefined, 'nothing was kept, which is what the rung means');
    t.end();
});

test('a frame is dumped sixteen bytes a row, with its ASCII beside it', async t => {
    // The first bytes of a JPEG, which is what the attached editor screenshot showed: a text-free
    // header that reads as dots, and then enough printable bytes to tell the two columns apart.
    const payload = Array.from({length: 20}, (_, index) =>
        (index < 4 ? 0xff : 0x41 + index).toString(16).padStart(2, '0'),
    ).join(' ');
    const rows = hexDump(payload);
    t.equal(rows.length, 2, 'twenty bytes make two rows');
    t.equal(rows[0]?.offset, '0x0000');
    t.equal(rows[0]?.hex.length, 16);
    t.equal(rows[1]?.offset, '0x0010');
    t.equal(rows[1]?.hex.length, 4, 'the last row carries only what is left');
    t.equal(rows[0]?.ascii, '....EFGHIJKLMNOP', 'a byte that is not printable reads as a dot');
    t.equal(rows[1]?.ascii, 'QRST');
    t.end();
});

test('a payload that is not hex yields no rows rather than a wrong picture', async t => {
    t.equal(hexDump('not a frame').length, 0, 'a sentence is not a frame');
    t.equal(hexDump('').length, 0, 'an empty payload has nothing to draw');
    t.equal(hexDump('abc').length, 0, 'an odd number of digits is not a byte string');
    t.equal(bytesOfHex('ZZ'), undefined, 'and a non-hex character is refused');
    t.same(bytesOfHex('ffd8'), [0xff, 0xd8], 'a space-less payload is still read');
    t.end();
});

test('the trace is read from where lukaot writes it, and absent when there is none', async t => {
    t.equal(
        traceOf(record({refs: {record: 'r', trace: 'trace-1'}})),
        'trace-1',
        'a record carries the causal identity at refs.trace',
    );
    t.equal(
        traceOf(record({traceId: 'trace-2'})),
        'trace-2',
        'the pre-conversion spelling is read too',
    );
    t.equal(
        traceOf(record({refs: {record: 'r'}})),
        undefined,
        'a record emitted outside a traced context has none, which is not a failure',
    );
    t.equal(
        traceOf(record({refs: {trace: ''}})),
        undefined,
        'and an empty identity is no identity',
    );
    t.end();
});

test('a decision is read with its candidates and the branch taken', async t => {
    const decided = record({
        decision: {
            discriminator: 'granularity',
            candidates: ['realm', 'layer'],
            chosen: 'layer',
            values: {size: 3},
        },
    });
    t.same(
        decisionOf(decided),
        {
            discriminator: 'granularity',
            candidates: ['realm', 'layer'],
            chosen: 'layer',
            values: {size: 3},
        },
        'what the branch was about, what it chose between, and what it chose',
    );
    t.equal(
        decisionOf(record({decision: {candidates: ['a']}})),
        undefined,
        'a decision without a discriminator is not one',
    );
    t.equal(decisionOf(record({})), undefined, 'and most lines report none');
    t.end();
});

test('a flow is read with its leg, sided by the caller and ordered by its counter', async t => {
    const call = record({
        flow: {
            id: '01M7RUN',
            kind: 'transfer.single',
            leg: 'hubA.transfer',
            legFrom: 'hubA',
            legTo: 'hub',
            legSeq: '1.2',
            step: 'submit',
            status: 'running',
        },
    });
    t.same(
        flowOf(call),
        {
            id: '01M7RUN',
            kind: 'transfer.single',
            leg: 'hubA.transfer',
            from: 'hubA',
            to: 'hub',
            seq: '1.2',
            step: 'submit',
            status: 'running',
        },
        'the run, the call, both of its ends and the counter that orders it',
    );
    t.equal(
        flowOf(record({flow: {kind: 'x'}})),
        undefined,
        'a flow without an id is a run of nothing',
    );
    t.equal(flowOf(record({})), undefined, 'and a record outside a flow carries none');
    t.end();
});

test('an intent is read as who asked, and the parent as what caused it', async t => {
    const asked = record({
        intent: {name: 'release-cd', actor: 'deployer', tenant: 'comesa', priority: 2},
    });
    t.same(
        intentOf(asked),
        {name: 'release-cd', actor: 'deployer', tenant: 'comesa', priority: 2},
        'the intent travels with the record, so a reader knows on whose behalf it ran',
    );
    t.equal(
        intentOf(record({intent: {actor: 'x'}})),
        undefined,
        'an intent with no name is not one',
    );
    t.equal(
        parentOf(record({refs: {record: 'r2', parent: 'r1'}})),
        'r1',
        'the parent link names the record that caused this one',
    );
    t.equal(parentOf(record({refs: {record: 'r1'}})), undefined, 'a root record has no parent');
    t.end();
});

test('an http exchange reads both the lukaot and the pre-conversion spelling', async t => {
    t.same(
        exchangeOf(
            record({
                req: {operation: 'POST', target: '/transfers', headers: {'x-trace': 't'}},
                res: {status: 201, elapsedMs: 12, headers: {'content-type': 'application/json'}},
            }),
        ),
        {
            request: 'POST /transfers',
            status: 201,
            elapsedMs: 12,
            requestHeaders: {'x-trace': 't'},
            responseHeaders: {'content-type': 'application/json'},
        },
        'a lukaot record writes operation/target and status/elapsedMs',
    );
    t.same(
        exchangeOf(
            record({req: {method: 'GET', url: '/x'}, res: {statusCode: 500, responseTime: 3}}),
        ),
        {request: 'GET /x', status: 500, elapsedMs: 3},
        'and a record written before the conversion is still drawn',
    );
    t.equal(exchangeOf(record({})), undefined, 'a line with no exchange has none');
    t.end();
});
