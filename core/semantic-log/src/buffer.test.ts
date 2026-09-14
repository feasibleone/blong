import t from 'tap';
import {createRingBuffer} from './buffer.ts';
import {createLogger} from './logger.ts';
import type {ErrorDetail} from './record.ts';
import {type Writer} from './writer.ts';

function capture(): {lines: string[]; writer: Writer} {
    const lines: string[] = [];
    return {lines, writer: {write: (line: string) => void lines.push(line)}};
}

t.test('entries come back in insertion order and drain on take', t => {
    const buffer = createRingBuffer<string>(3);
    buffer.push('a');
    buffer.push('b');
    t.same(buffer.take(), ['a', 'b']);
    t.same(buffer.take(), [], 'drained');
    t.end();
});

t.test('the bound discards the oldest entry and counts the loss', t => {
    const buffer = createRingBuffer<number>(2);
    buffer.push(1);
    buffer.push(2);
    buffer.push(3);
    t.same(buffer.take(), [2, 3]);
    t.equal(buffer.dropped(), 1);
    t.equal(buffer.size(), 0);
    t.end();
});

t.test('peek does not drain', t => {
    const buffer = createRingBuffer<string>(2);
    buffer.push('x');
    t.same(buffer.peek(), ['x']);
    t.equal(buffer.size(), 1);
    t.end();
});

t.test('clear empties without counting an overflow drop', t => {
    const buffer = createRingBuffer<number>(2);
    buffer.push(1);
    buffer.push(2);
    buffer.push(3); // overflow: 1 is discarded, one drop counted
    buffer.clear();
    t.equal(buffer.size(), 0);
    t.same(buffer.take(), []);
    t.equal(buffer.dropped(), 1, 'clear is not an overflow');
    t.end();
});

t.test('a non-positive bound is rejected rather than silently unbounded', t => {
    t.throws(() => createRingBuffer(0), /positive integer/);
    t.end();
});

// The hold-and-escalate tests exercise the buffer through the logger that owns
// it. They live here rather than in `logger.test.ts` because the task scope
// names only `buffer.ts`/`buffer.test.ts` as new files; this file doubles as
// the integration coverage for the two.

t.test('withheld detail is invisible until escalation', t => {
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer});
    logger.withhold({step: 'validating', detail: 'row 41'});
    logger.info('still healthy');
    t.equal(lines.length, 1);
    t.notMatch(lines[0], /row 41/, 'PRD R10 acceptance: withheld means withheld');
    logger.escalate('manual');
    t.match(lines[1], /row 41/, 'released on escalation');
    t.end();
});

t.test('an error escalates automatically', t => {
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer});
    logger.withhold({step: 'persisting'});
    logger.error('write failed');
    t.match(lines[0], /withheld/);
    t.match(lines[0], /persisting/);
    t.end();
});

t.test('buffer overflow is reported, never silent', t => {
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer, withholdLimit: 2});
    logger.withhold({n: 1});
    logger.withhold({n: 2});
    logger.withhold({n: 3});
    logger.error('boom');
    t.match(lines[0], /withheldDropped/, 'the drop is accounted for on the record');
    t.notMatch(lines[0], /"n":1/, 'the oldest entry was discarded');
    t.match(lines[0], /"n":2/);
    t.match(lines[0], /"n":3/);
    t.end();
});

t.test('a healthy record never carries withheld detail, even in json', t => {
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer, format: 'json'});
    logger.withhold({detail: 'row 41'});
    logger.info('still healthy');
    t.notMatch(lines[0], /row 41/);
    const parsed = JSON.parse(lines[0]) as {fields?: Record<string, unknown>};
    t.notOk(parsed.fields?.withheld, 'no `withheld` key on a healthy record');
    t.end();
});

t.test('a withheld secret is redacted before retention, not on the way out', t => {
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer, format: 'json', redact: ['fields.password']});
    logger.withhold({step: 'auth', password: 'hunter2'});
    logger.escalate('manual');
    t.notMatch(lines[0], /hunter2/, 'the secret never reaches the stream');
    const parsed = JSON.parse(lines[0]) as {
        fields?: {withheld?: {fields?: {step?: string; password?: string}}[]};
    };
    const [entry] = parsed.fields?.withheld ?? [];
    t.equal(entry?.fields?.password, '[redacted]', 'the buffer held the placeholder, not the secret');
    t.equal(entry?.fields?.step, 'auth', 'non-secret detail is still released');
    t.end();
});

t.test('a withheld error message is withheld before retention, frames intact', t => {
    const err = new Error('secret token');
    for (const format of ['human', 'json'] as const) {
        const {lines, writer} = capture();
        const logger = createLogger({service: 'hub', writer, format, redact: ['err.message']});
        logger.withhold({err});
        t.equal(lines.length, 0, `${format}: withheld means withheld until escalation`);
        logger.escalate('manual');
        t.notMatch(lines[0], /secret token/, `${format}: the secret never reaches the stream`);
        if (format === 'json') {
            const parsed = JSON.parse(lines[0]) as {
                fields?: {withheld?: {fields?: {err?: ErrorDetail}}[]};
            };
            const [entry] = parsed.fields?.withheld ?? [];
            t.equal(entry?.fields?.err?.message, '[redacted]');
            t.match(entry?.fields?.err?.stack ?? '', /\n\s+at /, 'the stack frames are preserved');
        } else {
            t.match(lines[0], /Error: \[redacted\]/);
            t.match(lines[0], /at /, 'the stack frames are preserved');
        }
    }
    t.end();
});

t.test('a withheld request header is redacted at the record root', t => {
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer, format: 'json', redact: ['req.headers.authorization']});
    logger.withhold({req: {headers: {authorization: 'Bearer secret', accept: '*/*'}}});
    t.equal(lines.length, 0, 'withheld means withheld until escalation');
    logger.escalate('manual');
    t.notMatch(lines[0], /Bearer secret/, 'the header never reaches the stream');
    const parsed = JSON.parse(lines[0]) as {
        fields?: {withheld?: {fields?: {req?: {headers?: {authorization?: string; accept?: string}}}}[]};
    };
    const [entry] = parsed.fields?.withheld ?? [];
    t.equal(entry?.fields?.req?.headers?.authorization, '[redacted]');
    t.equal(entry?.fields?.req?.headers?.accept, '*/*', 'unmatched detail is still released');
    t.end();
});

t.test('escalating with nothing withheld emits nothing', t => {
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer});
    logger.escalate('manual');
    t.equal(lines.length, 0);
    t.end();
});

t.test('an escalation the level threshold would filter keeps the detail buffered', t => {
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer, level: 'warn'});
    logger.withhold({step: 'retrying'});
    logger.escalate('manual');
    t.equal(lines.length, 0, 'info is filtered, so nothing is written');
    logger.error('gave up');
    t.equal(lines.length, 1);
    t.match(lines[0], /retrying/, 'a later failure still releases the retained detail');
    t.end();
});
