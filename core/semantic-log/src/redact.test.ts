import t from 'tap';
import {fingerprint} from './fingerprint.ts';
import {createLogger} from './logger.ts';
import type {ErrorDetail, LogRecord} from './record.ts';
import {REF_LENGTH} from './refs.ts';
import {matchesPath, redactRecord, redactWithheldBag} from './redact.ts';
import type {Writer} from './writer.ts';

function capture(): {lines: string[]; writer: Writer} {
    const lines: string[] = [];
    return {lines, writer: {write: (line: string) => void lines.push(line)}};
}

const base: LogRecord = {
    id: 'i',
    time: 1,
    level: 30,
    levelName: 'info',
    msg: 'm',
    service: 's',
    refs: {record: 'i'},
    req: {operation: 'POST', target: '/x', headers: {authorization: 'Bearer secret', accept: '*/*'}},
    fields: {password: 'hunter2', nested: {token: 'abc', keep: 'ok'}},
};

t.test('paths support exact segments and a wildcard', t => {
    t.equal(matchesPath('req.headers.authorization', 'req.headers.authorization'), true);
    t.equal(matchesPath('req.headers.accept', 'req.headers.authorization'), false);
    t.equal(matchesPath('req.headers.authorization', 'req.headers.*'), true);
    t.equal(matchesPath('fields.nested.deep.x', 'fields.nested.**'), true);
    t.end();
});

t.test('a single-segment wildcard covers one segment only', t => {
    t.equal(matchesPath('req.headers.authorization', 'req.*'), false, 'a partial path does not match');
    t.equal(matchesPath('fields.items.0.token', 'fields.items.*.token'), true, 'an array index is a segment');
    t.equal(matchesPath('fields.items.0.token', 'fields.*.token'), false, 'each segment needs its own match');
    t.end();
});

t.test('redactRecord replaces matched values and leaves the rest', t => {
    const out = redactRecord(base, ['req.headers.authorization', 'fields.password', 'fields.nested.token']);
    t.equal(out.req?.headers?.authorization, '[redacted]');
    t.equal(out.req?.headers?.accept, '*/*');
    t.equal(out.fields?.password, '[redacted]');
    t.equal((out.fields?.nested as Record<string, unknown>).token, '[redacted]');
    t.equal((out.fields?.nested as Record<string, unknown>).keep, 'ok');
    t.end();
});

t.test('a trailing double wildcard withholds a whole subtree', t => {
    const out = redactRecord(base, ['fields.nested.**']);
    t.equal(out.fields?.nested, '[redacted]');
    t.end();
});

t.test('array elements are addressed by index and redacted in place', t => {
    const record: LogRecord = {...base, fields: {items: [{token: 'abc', keep: 'ok'}, {token: 'def'}]}};
    const out = redactRecord(record, ['fields.items.*.token']);
    const items = out.fields?.items as Array<Record<string, unknown>>;
    t.equal(items[0].token, '[redacted]');
    t.equal(items[0].keep, 'ok');
    t.equal(items[1].token, '[redacted]');
    t.end();
});

t.test('redaction does not mutate the input record', t => {
    redactRecord(base, ['fields.password']);
    t.equal(base.fields?.password, 'hunter2');
    t.end();
});

t.test('every reference to a shared value is redacted on its own path', t => {
    const shared = {token: 'abc'};
    const record: LogRecord = {...base, fields: {first: shared, second: shared}};
    const out = redactRecord(record, ['fields.*.token']);
    t.equal((out.fields?.first as Record<string, unknown>).token, '[redacted]');
    t.equal((out.fields?.second as Record<string, unknown>).token, '[redacted]');
    t.end();
});

t.test('a self-referencing value terminates without leaking the input', t => {
    const record = {...base, fields: {nested: {token: 'abc', keep: 'ok'}}};
    (record.fields?.nested as Record<string, unknown>).self = record.fields?.nested;
    const out = redactRecord(record, ['fields.nested.token']);
    const nested = out.fields?.nested as Record<string, unknown>;
    t.equal(nested.token, '[redacted]');
    t.equal(nested.self, '[Circular]');
    t.end();
});

t.test('no paths configured means no work', t => {
    t.equal(redactRecord(base, []), base);
    t.end();
});

t.test('a whole-refs pattern never collapses the container and identity slots are never replaced', t => {
    // `refs`, `*` and `**` all match the container itself. `withIdentity` and the
    // logger spread `refs`, so replacing it with `[redacted]` would scatter the
    // string's characters into index keys — a malformed record. It is walked
    // instead, so the container keeps its shape.
    for (const pattern of ['refs', '*', '**']) {
        const out = redactRecord(base, [pattern]);
        t.ok(out.refs && !Array.isArray(out.refs), `${pattern}: refs stays a container`);
        t.equal(typeof out.refs.record, 'string', `${pattern}: the record reference is still addressable`);
        t.same(
            Object.keys(out.refs).filter(key => /^\d+$/.test(key)),
            [],
            `${pattern}: no character-index keys`,
        );
    }
    // The guard is narrow: a pattern naming a payload container still withholds
    // it exactly as before.
    t.equal(redactRecord(base, ['fields']).fields, '[redacted]', 'a fields pattern is unaffected by the guard');
    t.equal(redactRecord(base, ['msg']).msg, '[redacted]', 'a msg pattern is unaffected by the guard');
    t.end();
});

t.test('an identity slot named by a pattern keeps its value and container', t => {
    // `id` is structural, not caller payload: the logger restores `refs.record`
    // from it, so a pattern that replaced it made every record share
    // `semantic-log://record/[redacted]`, the cache key every record to one file
    // and the first prune delete it. Naming it is a no-op, not a way to redact
    // identity — the caller's identifying values are redacted where they sit.
    //
    // `redactRecord` is a pure function and mints nothing, so the property it
    // owes is the local one asserted here: the id it was handed comes back
    // unchanged and `refs` stays a container. Addressability *after* minting is
    // asserted end to end below, where `withIdentity` actually runs — asserting
    // a ULID shape against this fixture would be asserting another function's job.
    const id = '01J8Z9K2M9PQRSTVWXYZ0A1B2C';
    for (const pattern of ['id', '**']) {
        const out = redactRecord({...base, id}, [pattern]);
        t.equal(out.id, id, `${pattern}: the record id survives`);
        t.ok(out.refs && !Array.isArray(out.refs), `${pattern}: refs stays a container`);
        // The guard protects the container's *shape*, not its contents: a `**`
        // pattern still walks inside and withholds `refs.record`'s value. That
        // is safe because the logger restores that one slot from the id after
        // the walk — which is what the end-to-end test below pins.
        t.same(Object.keys(out.refs), Object.keys(base.refs), `${pattern}: the container keeps its keys`);
    }
    t.equal(redactRecord({...base, id}, ['msg']).id, id, 'a payload pattern leaves the id alone too');
    t.end();
});

t.test('a pattern naming identity leaves the reference family resolvable end to end', t => {
    for (const pattern of ['refs', 'id', '**']) {
        const {lines, writer} = capture();
        createLogger({service: 'hub', writer, format: 'json', redact: [pattern]}).info('kept');
        const record = JSON.parse(lines[0]) as LogRecord;
        t.ok(record.refs && !Array.isArray(record.refs), `${pattern}: refs survived identity minting`);
        t.same(
            Object.keys(record.refs).filter(key => /^\d+$/.test(key)),
            [],
            `${pattern}: no character-index keys anywhere in it`,
        );
        t.ok(record.refs.record, `${pattern}: refs.record resolves`);
        t.match(record.refs.record, /^[0-9A-Z]{26}$/, `${pattern}: it is a minted ULID, not a placeholder`);
        t.match(record.id, /^[0-9A-Z]{26}$/, `${pattern}: the id keeps the minted value`);
        t.equal(record.refs.record, record.id, `${pattern}: it points at that record`);
        t.ok(record.refs.template, `${pattern}: refs.template resolves`);
        t.equal(record.refs.template, record.fingerprint?.slice(0, REF_LENGTH), `${pattern}: it derives from the fingerprint`);
    }
    t.end();
});

t.test('redaction applies before the record is rendered', t => {
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer, redact: ['req.headers.authorization']});
    logger.info('called', {req: {operation: 'POST', target: '/x', headers: {authorization: 'Bearer secret'}}});
    t.notMatch(lines[0], /Bearer secret/);
    t.match(lines[0], /authorization: \[redacted\]/);
    t.end();
});

t.test('redaction behaves identically in json mode', t => {
    const {lines, writer} = capture();
    const logger = createLogger({
        service: 'hub',
        writer,
        format: 'json',
        redact: ['req.headers.authorization'],
    });
    logger.info('called', {req: {operation: 'POST', target: '/x', headers: {authorization: 'Bearer secret'}}});
    t.notMatch(lines[0], /Bearer secret/);
    t.equal((JSON.parse(lines[0]) as LogRecord).req?.headers?.authorization, '[redacted]');
    t.end();
});

t.test('child loggers inherit the redaction paths', t => {
    const {lines, writer} = capture();
    const child = createLogger({service: 'hub', writer, redact: ['fields.password']}).child({tenant: 'acme'});
    child.info('called', {password: 'hunter2'});
    t.notMatch(lines[0], /hunter2/);
    t.match(lines[0], /password: \[redacted\]/);
    t.end();
});

t.test('array-element paths redact the elements themselves', t => {
    const record: LogRecord = {...base, fields: {tokens: ['s1', 's2']}};
    const out = redactRecord(record, ['fields.tokens.*']);
    t.same(out.fields?.tokens, ['[redacted]', '[redacted]'], 'each element is withheld');
    t.same(record.fields?.tokens, ['s1', 's2'], 'the input is untouched');
    t.end();
});

t.test('a wildcard element path withholds a whole element object', t => {
    const record: LogRecord = {...base, fields: {items: [{token: 'abc'}]}};
    const out = redactRecord(record, ['fields.items.*']);
    t.same(out.fields?.items, ['[redacted]']);
    t.end();
});

t.test('non-plain values survive a redaction pass intact', t => {
    const when = new Date('2026-09-13T10:11:12.345Z');
    const lookup = new Map([['token', 'abc']]);
    const pattern = /secret/;
    const bytes = Buffer.from('hi');
    const record: LogRecord = {...base, fields: {password: 'hunter2', when, lookup, pattern, bytes}};
    const out = redactRecord(record, ['fields.password']);
    t.equal(out.fields?.password, '[redacted]', 'the matched plain value is still withheld');
    t.equal(out.fields?.when, when, 'the Date is passed through by reference');
    t.ok(out.fields?.when instanceof Date, 'the Date is still a Date');
    t.equal(out.fields?.lookup, lookup, 'the Map is passed through by reference');
    t.equal((out.fields?.lookup as Map<string, string>).get('token'), 'abc', 'the Map keeps its entries');
    t.equal(out.fields?.pattern, pattern, 'the RegExp is passed through by reference');
    t.ok(out.fields?.pattern instanceof RegExp, 'the RegExp is still a RegExp');
    t.equal(out.fields?.bytes, bytes, 'the Buffer is passed through by reference');
    t.equal((out.fields?.bytes as Buffer).toString(), 'hi', 'the Buffer keeps its bytes');
    t.end();
});

t.test('a withheld message leaves no trace in identity or output', t => {
    for (const format of ['human', 'json'] as const) {
        const {lines, writer} = capture();
        createLogger({service: 'hub', writer, format, redact: ['msg']}).info('token hunter2');
        const line = lines[0];
        t.notMatch(line, /hunter2/, `${format}: the rendered line withholds the message`);
        if (format === 'json') {
            const record = JSON.parse(line) as LogRecord;
            t.equal(record.msg, '[redacted]');
            t.notMatch(record.template ?? '', /hunter2/, 'the template derives from the redacted message');
            t.match(record.template ?? '', /\[MSG: \[redacted\]\]/);
            t.notMatch(record.refs.template ?? '', /hunter2/, 'refs.template carries no withheld value');
            t.equal(record.fingerprint, fingerprint(record), 'the fingerprint hashes the retained record');
            t.equal(record.refs.template, record.fingerprint?.slice(0, REF_LENGTH), 'the template ref derives from that hash');
            t.equal(record.refs.record, record.id, 'refs.record still points at the record id');
        }
    }
    t.end();
});

t.test('a withheld error message is absent from the stack and the identity', t => {
    const err = new Error('secret token');
    t.match(err.stack ?? '', /secret token/, 'the fixture stack really embeds the message');
    for (const format of ['human', 'json'] as const) {
        const {lines, writer} = capture();
        createLogger({service: 'hub', writer, format, redact: ['err.message']}).error('failed', {err});
        const line = lines[0];
        t.notMatch(line, /secret token/, `${format}: the rendered line withholds the error message`);
        if (format === 'json') {
            const record = JSON.parse(line) as LogRecord;
            t.equal(record.err?.message, '[redacted]');
            t.notMatch(record.err?.stack ?? '', /secret token/, 'the stack no longer embeds the message');
            t.match(record.err?.stack ?? '', /\n\s+at /, 'the stack frames are preserved');
            t.notMatch(record.template ?? '', /secret token/, 'the template derives from the sanitized error');
            t.equal(record.fingerprint, fingerprint(record), 'the fingerprint hashes the retained record');
        } else {
            t.match(line, /\n\s+error {2}Error: \[redacted\]/);
            t.match(line, /\n\s+at /, 'the stack frames are preserved');
        }
    }
    t.end();
});

t.test('withholding the whole error keeps the frames but not the message', t => {
    const err = new Error('secret token');
    const {lines, writer} = capture();
    createLogger({service: 'hub', writer, format: 'json', redact: ['err']}).error('failed', {err});
    const record = JSON.parse(lines[0]) as LogRecord;
    t.notMatch(lines[0], /secret token/);
    t.equal(record.err?.message, '[redacted]');
    t.match(record.err?.stack ?? '', /\n\s+at /, 'the frames survive a whole-error pattern');
    t.notMatch(record.template ?? '', /secret token/);
    t.end();
});

t.test('a withheld bag is redacted at the root, like the record slot it stands for', t => {
    const bag = {
        err: new Error('secret token'),
        req: {headers: {authorization: 'Bearer secret', accept: '*/*'}},
        keep: 'ok',
    };
    const out = redactWithheldBag(bag, ['err.message', 'req.headers.authorization']);
    const err = out.err as ErrorDetail;
    t.equal(err.message, '[redacted]', 'a root-scoped error pattern reaches a withheld error');
    t.match(err.stack ?? '', /\n\s+at /, 'the stack frames are preserved');
    t.notMatch(err.stack ?? '', /secret token/, 'the message is removed from the stack too');
    const req = out.req as {headers: {authorization: string; accept: string}};
    t.equal(req.headers.authorization, '[redacted]', 'a root-scoped request pattern reaches a withheld request');
    t.equal(req.headers.accept, '*/*', 'unmatched detail is untouched');
    t.equal(out.keep, 'ok', 'a plain key survives');
    t.end();
});

t.test('a withheld bag is still redacted under the fields prefix', t => {
    const out = redactWithheldBag({step: 'auth', password: 'hunter2'}, ['fields.password']);
    t.equal(out.password, '[redacted]', 'the presentation-position pattern still reaches the bag');
    t.equal(out.step, 'auth');
    t.end();
});

t.test('withholding the whole withheld error keeps the frames but not the message', t => {
    const out = redactWithheldBag({err: new Error('secret token')}, ['err']);
    const err = out.err as ErrorDetail;
    t.equal(err.message, '[redacted]');
    t.match(err.stack ?? '', /\n\s+at /, 'a whole-error pattern keeps the frames');
    t.notMatch(JSON.stringify(out), /secret token/);
    t.end();
});

t.test('a pattern covering the whole bag withholds every key', t => {
    const out = redactWithheldBag({password: 'hunter2', step: 'auth'}, ['fields']);
    t.same(out, {password: '[redacted]', step: '[redacted]'});
    t.end();
});

t.test('no patterns configured returns the bag untouched', t => {
    const bag = {password: 'hunter2'};
    t.equal(redactWithheldBag(bag, []), bag);
    t.end();
});

t.test('a withheld error is normalised, not left as an empty object', t => {
    // `JSON.stringify` sees `{message, stack}` as non-enumerable, so an Error in
    // the bag serialised to `{}` on escalation: no message, no frames, nothing
    // R10 exists to surface. Normalisation runs even with no patterns set.
    const out = redactWithheldBag({err: new Error('connection reset by peer')}, []);
    const err = out.err as ErrorDetail;
    t.equal(err.type, 'Error');
    t.equal(err.message, 'connection reset by peer', 'the message survives');
    t.match(err.stack ?? '', /\n\s+at /, 'and at least the first frame survives');
    t.end();
});
