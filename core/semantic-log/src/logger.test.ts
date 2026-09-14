import {existsSync, readFileSync} from 'node:fs';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import t from 'tap';
import {openCache, type RecordStore} from './cache.ts';
import {captureProcessFailures, createLogger} from './logger.ts';
import type {ErrorDetail, LogRecord} from './record.ts';
import {PAYLOAD_THRESHOLD} from './refs.ts';
import {packageVersion} from './version.ts';
import {getWriter, setWriter, stdoutWriter, type Writer} from './writer.ts';
import {bindTrace, withFlow, withIntent, step} from './context.ts';

function capture(): {lines: string[]; writer: Writer} {
    const lines: string[] = [];
    return {lines, writer: {write: (line: string) => void lines.push(line)}};
}

t.test('zero-config usage writes a readable line to the configured writer', t => {
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer, now: () => 1757765472345});
    logger.info('hello');
    t.equal(lines.length, 1);
    // Asserted by shape, not by day: the injected clock only makes output deterministic.
    t.match(lines[0], /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z info {2}hub hello/);
    t.match(lines[0], /r=semantic-log:\/\/record\//, 'a reference is always present');
    t.end();
});

t.test('the level threshold filters, and can change at runtime', t => {
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', level: 'warn', writer});
    logger.info('hidden');
    logger.warn('shown');
    t.equal(lines.length, 1);
    logger.setLevel('debug');
    logger.debug('now shown');
    t.equal(lines.length, 2);
    t.end();
});

t.test('child loggers inherit bindings and can add their own', t => {
    const {lines, writer} = capture();
    const root = createLogger({service: 'hub', writer, bindings: {tenant: 'acme'}});
    const child = root.child({operation: 'quote.create'});
    child.info('child line');
    root.info('root line');
    t.match(lines[0], /quote\.create/, 'the child carries its own binding');
    t.match(lines[0], /tenant: acme/, 'the child inherits the root binding');
    t.notMatch(lines[1], /quote\.create/, 'the child binding does not leak into the root');
    t.end();
});

t.test('base fields are always present', t => {
    const {lines, writer} = capture();
    createLogger({service: 'hub', writer}).info('x');
    // The service name is a header token (`info  hub x`), not a `service=` pair — the renderer
    // writes it bare, and R20 lists it as a header detail.
    t.match(lines[0], /info {2}hub x/, 'the service name is in the header');
    // The version is a header detail too, defaulted from the package manifest.
    t.ok(lines[0].includes(`version=${packageVersion} `), 'the emitter version is in the header');
    // Base fields (process id, hostname) travel in `record.fields`, rendered one per indented line.
    t.match(lines[0], /\n\s+pid: \d+/, 'the process id is reported');
    t.end();
});

t.test('the version reaches the header and json mode, and a service can override it', t => {
    const human = capture();
    createLogger({service: 'hub', writer: human.writer}).info('x');
    t.ok(human.lines[0].includes(`version=${packageVersion} `), 'the default is the package version');
    const json = capture();
    createLogger({service: 'hub', writer: json.writer, format: 'json', version: '9.9.9'}).info('x');
    t.equal((JSON.parse(json.lines[0]) as {version: string}).version, '9.9.9', 'json carries the override');
    t.end();
});

t.test('an Error in the error slot is serialized, not stringified', t => {
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer});
    logger.error('persist failed', {err: new Error('connection timeout')});
    t.match(lines[0], /\n\s+error {2}Error: connection timeout/);
    t.end();
});

t.test('request and response details render as blocks', t => {
    const {lines, writer} = capture();
    createLogger({service: 'hub', writer}).info('quoted', {
        req: {operation: 'POST', target: '/quotes'},
        res: {status: 201, elapsedMs: 12},
    });
    t.match(lines[0], /\n\s+request {2}POST \/quotes/);
    t.match(lines[0], /\n\s+response {2}201 \(12ms\)/);
    t.end();
});

t.test('json mode emits one parseable object per record', t => {
    const {lines, writer} = capture();
    createLogger({service: 'hub', writer, format: 'json'}).info('hello');
    const parsed = JSON.parse(lines[0]) as {service: string; msg: string; id: string};
    t.equal(parsed.service, 'hub');
    t.equal(parsed.msg, 'hello');
    t.ok(parsed.id);
    t.end();
});

t.test('silencing is a writer swap, not a branch in the logger', t => {
    setWriter(null);
    t.equal(getWriter(), null);
    // Observe the real sink: while silenced the logger must not reach stdout at
    // all. Every chunk is forwarded to the original write so the test runner's
    // own output is unaffected — only the silence is under observation.
    const originalWrite = process.stdout.write;
    const written: string[] = [];
    process.stdout.write = ((chunk: string | Uint8Array, encoding?: unknown, callback?: unknown): boolean => {
        written.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
        return (originalWrite as unknown as (c: unknown, e?: unknown, cb?: unknown) => boolean).call(
            process.stdout,
            chunk,
            encoding,
            callback,
        );
    }) as typeof process.stdout.write;
    try {
        // No explicit `writer` option, so the logger must consult the global
        // writer — which is `null` — and stay silent. Reintroducing a fallback
        // to `stdoutWriter` lands in `written` and fails the assertion below.
        createLogger({service: 'hub'}).info('nobody hears this');
        createLogger({service: 'hub'}).error('nor this');
    } finally {
        process.stdout.write = originalWrite;
        setWriter(stdoutWriter);
    }
    t.equal(written.length, 0, 'a silenced logger writes nothing at all');
    t.end();
});

t.test('ambient flow and intent reach the record', async t => {
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer});
    await withIntent({name: 'User_Checkout'}, async () => {
        // The flow id is a caller-minted ULID naming one execution (PRD R9),
        // and the kind is the stable process name that goes with it.
        await withFlow({id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', kind: 'transfer.single'}, async () => {
            await step('discovery', async () => logger.info('discovering'));
        });
    });
    t.match(lines[0], /flow=01ARZ3NDEKTSV4RRFFQ69G5FAV\/discovery#0/);
    t.match(lines[0], /intent=User_Checkout/);
    t.end();
});

t.test('fatal exits through the injected exit function', t => {
    const {lines, writer} = capture();
    let exited: number | undefined;
    const logger = createLogger({service: 'hub', writer, exit: code => void (exited = code)});
    logger.fatal('unrecoverable');
    t.equal(lines.length, 1);
    t.equal(exited, 1);
    t.end();
});

t.test('a fatal record is on disk the moment fatal returns, with no flush (PRD R21)', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'semantic-log-logger-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 10});
    const {lines, writer} = capture();
    const exited: number[] = [];
    const logger = createLogger({service: 'hub', writer, cache, exit: code => void exited.push(code)});
    logger.fatal('unrecoverable');
    // Read the backing files synchronously, with no `await` in between: a queued
    // asynchronous write would still be pending here, because the event loop has
    // not turned. `putSync` is what lets the record a process failure most needs
    // to be looked up survive the `exit` that follows.
    const id = /r=semantic-log:\/\/record\/([0-9A-Z]+)/.exec(lines[0])?.[1] ?? '';
    t.ok(id, 'the rendered line carries the id');
    const stored = JSON.parse(readFileSync(join(dir, 'records', `${id}.json`), 'utf8')) as LogRecord;
    t.equal(stored.msg, 'unrecoverable', 'the fatal record is retained before exit');
    t.equal(stored.levelName, 'fatal');
    t.equal(stored.refs.record, id, 'the retained copy names itself');
    t.equal(
        readFileSync(join(dir, 'index.jsonl'), 'utf8').trim().split('\n').length,
        1,
        'the index line landed too, so the record is not an orphan',
    );
    t.same(exited, [1], 'the exit still ran immediately');
    // No flush of any kind was called, and the normal lookup path resolves it.
    t.equal((await cache.get(id))?.msg, 'unrecoverable');
    await cache.close();
});

t.test('captureProcessFailures records fatal failures and unregisters handlers', t => {
    const {lines, writer} = capture();
    const exited: number[] = [];
    const logger = createLogger({service: 'hub', writer, exit: code => void exited.push(code)});
    // The listeners already on the channel are captured before the hooks join,
    // so "left as it found it" below is a comparison rather than a count that
    // silently assumes the test process has no other listeners.
    const before = process.listeners('unhandledRejection');
    const off = captureProcessFailures(logger);
    const joined = process.listeners('unhandledRejection').filter(listener => !before.includes(listener));
    t.equal(joined.length, 1, 'the hooks join the process-wide rejection channel');
    try {
        process.emit('unhandledRejection', new Error('dropped'), Promise.resolve());
        t.match(lines.join('\n'), /unhandledRejection/);
        t.match(lines.join('\n'), /\bfatal\b/, 'a process-level failure is recorded at fatal level');
        t.equal(exited.length, 1, 'a process-level failure goes through the injected exit');
        t.equal(exited[0], 1);
    } finally {
        off();
    }
    // The disposer's other half, made falsifiable: without this, a disposer that
    // only recorded would pass every line above.
    //
    // `process.emit` is the shared process channel, not a private wire to this
    // logger, and a bare emission with no listener left falls through to the
    // runtime's default unhandled-rejection path — which the test harness
    // reports as a real failure (`tapCaught: unhandledRejection`, attributed to
    // the emitting line). That is a property of the harness, not a defect in
    // `off()`: once the disposer has run the channel holds no listener at all.
    // The emission below is therefore given a decoy listener: it keeps the event
    // off the default path and proves the event really was emitted, while any
    // listener the disposer failed to release stays attached and would record.
    const afterOff = process.listeners('unhandledRejection');
    t.notOk(afterOff.some(listener => joined.includes(listener)), 'the disposer released the hooks');
    t.equal(afterOff.length, before.length, 'and left the channel as it found it');
    const seen: unknown[] = [];
    const decoy = (reason: unknown): void => void seen.push(reason);
    process.on('unhandledRejection', decoy);
    const linesAfterOff = lines.length;
    const exitsAfterOff = exited.length;
    try {
        process.emit('unhandledRejection', new Error('after off'), Promise.resolve());
    } finally {
        process.off('unhandledRejection', decoy);
    }
    t.equal(seen.length, 1, 'the event was emitted');
    t.equal(lines.length, linesAfterOff, 'a failure after the disposer is not recorded');
    t.equal(exited.length, exitsAfterOff, 'and does not exit through the released logger');
    t.end();
});

t.test('every emitted record lands in the local cache', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'semantic-log-logger-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 10});
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer, cache});
    logger.info('cached');
    await logger.flush();
    const id = /r=semantic-log:\/\/record\/([0-9A-Z]+)/.exec(lines[0])?.[1] ?? '';
    t.ok(id, 'the line carries the id');
    const stored = await cache.get(id);
    t.equal(stored?.msg, 'cached', 'PRD R21 acceptance');
    // The retained copy is the emitted record, identity stamped, not the
    // pre-identity draft: the CLI reads back what the writer rendered.
    t.equal(stored?.refs.record, id, 'the retained record names itself');
    t.equal(stored?.service, 'hub');
    await cache.close();
});

t.test('a field past the payload threshold renders as a reference and is retained (PRD R19/R20)', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'semantic-log-logger-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 10});
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer, cache, payloads: cache});

    // The threshold is a length in rendered characters and it is the same
    // constant on both sides of the mechanism: exactly at it a value is
    // retained and its reference rendered; one character below it the value
    // stays inline. Asserting both sides is what pins *where* the line is
    // drawn — a threshold tested on one side only could be off by any amount.
    const atThreshold = 'A'.repeat(PAYLOAD_THRESHOLD);
    const belowThreshold = 'B'.repeat(PAYLOAD_THRESHOLD - 1);
    logger.info('configuration', {large: atThreshold, small: belowThreshold});
    await logger.flush();

    const line = lines[0];
    const reference = /^ {2}large: (semantic-log:\/\/payload\/[0-9A-HJKMNP-TV-Z]+)$/m.exec(line)?.[1] ?? '';
    t.ok(reference, 'the large field renders as a payload reference, not inlined');
    t.notMatch(line, /A{1024}/, 'the large value itself is not in the line');
    t.match(line, `  small: ${belowThreshold}`, 'a field below the threshold is still inlined');

    const id = reference.slice('semantic-log://payload/'.length);
    t.equal(await cache.getPayload(id), atThreshold, 'the retained payload is the value the line dropped');
    t.same(cache.payloadStats(), {size: 1, dropped: 0}, 'exactly one payload was retained');

    // The record stays complete: the value is still in `fields` and the record
    // names its payload, so nothing had to be fetched back to render it and
    // JSON mode carries it verbatim.
    const recordId = /r=semantic-log:\/\/record\/([0-9A-HJKMNP-TV-Z]+)/.exec(line)?.[1] ?? '';
    const stored = await cache.get(recordId);
    t.equal(stored?.fields?.large, atThreshold, 'the value stays in the retained record');
    t.equal(stored?.refs.payloads?.large, id, 'the retained record names the payload it indexes');

    const machine = capture();
    const jsonLogger = createLogger({service: 'hub', writer: machine.writer, format: 'json', payloads: cache});
    const carried = 'C'.repeat(PAYLOAD_THRESHOLD);
    jsonLogger.info('configuration', {large: carried});
    await jsonLogger.flush();
    t.equal(
        (JSON.parse(machine.lines[0]) as {fields: {large: string}}).fields.large,
        carried,
        'json mode carries the value verbatim, with no lookup needed',
    );

    // Retention and rendering are one decision: with a store configured a
    // record that carries no large field mints no reference and retains
    // nothing, rather than pointing at a payload that was never written.
    const small = capture();
    const smallLogger = createLogger({service: 'hub', writer: small.writer, payloads: cache});
    smallLogger.info('small', {status: 'ok'});
    await smallLogger.flush();
    t.notMatch(small.lines[0], /semantic-log:\/\/payload\//, 'no reference is minted for a small record');
    t.same(cache.payloadStats(), {size: 2, dropped: 0}, 'and no payload was retained for it');
    await cache.close();
});

t.test('a message-only record is handled by a payload-aware logger and mints nothing (PRD R19)', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'semantic-log-logger-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 10});
    const {lines, writer} = capture();
    // The closest thing the public API has to a field-less record: no caller
    // fields at all, so the payload sweep has nothing of the caller's to walk.
    // It is still a real case — a payload-aware logger is configured to retain
    // payloads and a caller logs a plain message — and the base `pid`/`hostname`
    // fields are far below the threshold, so nothing may be minted or retained.
    const logger = createLogger({service: 'hub', writer, cache, payloads: cache});

    logger.info('no caller fields');
    await logger.flush();

    t.equal(lines.length, 1, 'the record still renders');
    t.notMatch(lines[0], /semantic-log:\/\/payload\//, 'no payload reference is minted for a message-only record');
    t.same(cache.payloadStats(), {size: 0, dropped: 0}, 'and nothing was retained');
    await cache.close();
});

t.test('a value that will not serialise again is not retained (PRD R19 threshold guard)', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'semantic-log-logger-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 10});
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer, cache, payloads: cache});
    // The logger measures a value with `renderField` and then serialises it a
    // second time to retain it. A `toJSON` that answers once with a long
    // document and then nothing makes the two reads disagree; the guard must
    // skip the field rather than index a payload whose serialisation is
    // `undefined` — that write would fail and leave a dead reference behind.
    let reads = 0;
    const fickle = {toJSON: () => (++reads === 1 ? 'D'.repeat(PAYLOAD_THRESHOLD) : undefined)};
    logger.info('unstable', {fickle});
    await logger.flush();
    t.notMatch(lines[0], /semantic-log:\/\/payload\//, 'no reference is minted for a value that will not serialise again');
    t.same(cache.payloadStats(), {size: 0, dropped: 0}, 'nothing was retained for it');
    await cache.close();
});

t.test('a fatal record retains its payload synchronously, before exit (PRD R19/R21)', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'semantic-log-logger-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 10});
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer, cache, payloads: cache, exit: () => {}});
    const large = 'F'.repeat(PAYLOAD_THRESHOLD);
    logger.fatal('unrecoverable', {configuration: large});
    // No flush: `fatal` exits synchronously, so `putPayloadSync` must have
    // landed the payload before `emit` returned, exactly as `putSync` lands the
    // record. Reading the files directly, with no `await` in between, is what
    // distinguishes a synchronous write from one still queued on the event loop.
    const id = /^ {2}configuration: semantic-log:\/\/payload\/([0-9A-HJKMNP-TV-Z]+)$/m.exec(lines[0])?.[1] ?? '';
    t.ok(id, 'the rendered line names the payload');
    t.equal(
        JSON.parse(readFileSync(join(dir, 'payloads', `${id}.json`), 'utf8')),
        large,
        'the payload is on disk the moment fatal returns',
    );
    t.match(readFileSync(join(dir, 'payloads.jsonl'), 'utf8'), new RegExp(id), 'the payload index line landed too');
    await cache.close();
});

t.test('the retained copy is a snapshot taken at emit time (PRD R21)', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'semantic-log-logger-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 10});
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer, cache});
    const order = {id: 'o-1', status: 'pending'};
    logger.info('created', {order});
    // With no `redact` paths configured nothing detached the caller's object
    // from the record, and the write is still queued at this point. Mutating
    // the object now must not change what the CLI reads back: the retained
    // artifact has to agree with the line the writer already rendered.
    order.status = 'paid';
    await logger.flush();
    const id = /r=semantic-log:\/\/record\/([0-9A-Z]+)/.exec(lines[0])?.[1] ?? '';
    const stored = await cache.get(id);
    t.same(stored?.fields?.order, {id: 'o-1', status: 'pending'}, 'the value at emit time is retained');
    t.match(lines[0], /"status":"pending"/, 'and the retained copy agrees with the rendered line');
    await cache.close();
});

t.test('a record the cache cannot serialise is copied as far as it can be, and never throws', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'semantic-log-logger-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 10});
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer, cache, level: 'debug'});

    // `structuredClone` refuses functions, so the snapshot falls back to the
    // JSON round trip the cache itself would have performed — the function is
    // dropped and the rest of the record is still retained.
    logger.debug('with a function', {handler: () => 'nope'});
    await logger.flush();
    const id = /r=semantic-log:\/\/record\/([0-9A-Z]+)/.exec(lines[0])?.[1] ?? '';
    t.equal((await cache.get(id))?.msg, 'with a function');

    // A value neither `structuredClone` (the function) nor `JSON.stringify` (the
    // cycle) can copy is retained as-is: losing strict snapshot semantics for an
    // exotic value must not turn the log call into a throw. The cache write then
    // fails on that value, which the tracker absorbs.
    const cyclic: Record<string, unknown> = {note: 'kept'};
    cyclic.fn = () => 'nope';
    cyclic.self = cyclic;
    t.doesNotThrow(() => logger.debug('unsnapshotable', {cyclic}));
    await logger.flush();
    t.equal(lines.length, 2, 'the stream got the record all the same');
    await cache.close();
});

t.test('a record is redacted before it is retained (§5.1 retained store row)', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'semantic-log-logger-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 10});
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer, cache, redact: ['fields.password', 'fields.credential.**']});
    logger.info('guarded', {password: 'hunter2', credential: {token: 'tok-9'}});
    await logger.flush();
    const id = /r=semantic-log:\/\/record\/([0-9A-Z]+)/.exec(lines[0])?.[1] ?? '';
    const stored = await cache.get(id);
    t.notMatch(JSON.stringify(stored), /hunter2|tok-9/, 'the withheld values are absent from the retained copy');
    t.match(JSON.stringify(stored), /\[redacted\]/, 'the paths are withheld, not omitted');
    await cache.close();
});

t.test('a failing cache write is absorbed, and the next record still lands', async t => {
    const stored: string[] = [];
    const failing: RecordStore = {
        put: async (record: LogRecord) => {
            stored.push(record.msg);
            if (record.msg === 'first') {
                throw new Error('disk full');
            }
        },
        get: async () => undefined,
        putSync: () => {},
        stats: () => ({size: stored.length, dropped: 0}),
        close: async () => {},
    };
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer, cache: failing});
    // An escaped rejection would be reported at `fatal` by captureProcessFailures
    // and exit the process (Task 7), so a rejecting write must be absorbed here.
    // The decisive property is that an *un-flushed, un-awaited* tail never
    // rejects: awaiting `flush` attaches a handler to the tracker's last link,
    // which would handle the rejection the logger failed to handle and let an
    // implementation with no `.catch` pass. So the failing write is queued and
    // then deliberately left alone; a macrotask — the point at which Node
    // decides a rejection is unhandled — is drained through a promise that the
    // tracker does not own, and only afterwards is `flush` allowed to run.
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown): void => void rejections.push(reason);
    process.on('unhandledRejection', onRejection);
    try {
        logger.info('first');
        await new Promise(resolve => setImmediate(resolve));
        t.equal(rejections.length, 0, 'no rejection escaped the un-awaited tracker tail');
        logger.info('second');
        await logger.flush();
        t.equal(lines.length, 2, 'a failed write does not stop the stream');
        t.same(stored, ['first', 'second'], 'the queue survived the failure');
        t.equal(rejections.length, 0, 'and none escaped by the time the queue drained');
    } finally {
        process.off('unhandledRejection', onRejection);
    }
});

t.test('a child shares the family cache, and the parent flush drains it', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'semantic-log-logger-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 5});
    const {writer} = capture();
    const root = createLogger({service: 'hub', writer, cache, level: 'debug'});
    const child = root.child({operation: 'quote.create'});
    for (let i = 0; i < 8; i++) {
        child.debug(`line ${i}`);
    }
    // The child's writes are still in flight here; only the shared tracker makes
    // this flush wait for them.
    await root.flush();
    t.equal(cache.stats().size, 5, 'the cache is bounded across the family');
    t.equal(cache.stats().dropped, 3, 'the overflow was pruned');
    await cache.close();
});

t.test('a plain object in the error slot is kept as structured detail', t => {
    const {lines, writer} = capture();
    createLogger({service: 'hub', writer}).error('upstream refused', {
        err: {type: 'UpstreamError', message: 'gateway timeout'},
    });
    t.match(lines[0], /\n\s+error {2}UpstreamError: gateway timeout/);
    t.end();
});

t.test('fatal exits through process.exit when no exit is injected', t => {
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer});
    const originalExit = process.exit;
    const codes: number[] = [];
    process.exit = ((code?: number): never => {
        codes.push(code ?? 0);
        return undefined as never;
    }) as typeof process.exit;
    try {
        logger.fatal('unrecoverable');
    } finally {
        process.exit = originalExit;
    }
    t.equal(lines.length, 1, 'the record still reaches the stream');
    t.same(codes, [1], 'the default exit is taken with a failure code');
    t.end();
});

t.test('trace is a level of its own, and the level is readable', t => {
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer, level: 'trace'});
    t.equal(logger.level(), 10, 'the numeric threshold is reported');
    logger.trace('very fine detail');
    t.equal(lines.length, 1);
    t.match(lines[0], /\btrace\b/);
    t.end();
});

t.test('escalation without a reason still releases the withheld detail', t => {
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer});
    logger.withhold({step: 'persisting'});
    logger.escalate();
    t.equal(lines.length, 1);
    t.match(lines[0], / escalation /, 'the escalation is recorded without a reason');
    t.match(lines[0], /persisting/, 'the withheld detail is released all the same');
    t.end();
});

t.test('captureProcessFailures also records uncaught exceptions', t => {
    const {lines, writer} = capture();
    const exited: number[] = [];
    const logger = createLogger({service: 'hub', writer, exit: code => void exited.push(code)});
    const before = process.listeners('uncaughtException');
    const off = captureProcessFailures(logger);
    const joined = process.listeners('uncaughtException').filter(listener => !before.includes(listener));
    t.equal(joined.length, 1, 'the hooks join the process-wide exception channel');
    try {
        process.emit('uncaughtException', new Error('boom'));
        t.match(lines.join('\n'), /uncaughtException/);
        t.equal(exited.length, 1, 'a process-level failure goes through the injected exit');
        t.equal(exited[0], 1);
    } finally {
        off();
    }
    // The disposer's exception half, asserted the way the rejection half is in
    // the test above. Without this, a disposer that released only the rejection
    // hook would pass every line there and every line above. The emission after
    // `off()` is given a decoy listener for the same reason: a bare emission
    // with no listener falls through to the runtime's default path, which the
    // harness reports as a failure of the emitting line rather than of an
    // assertion here (see the note in that test).
    const afterOff = process.listeners('uncaughtException');
    t.notOk(afterOff.some(listener => joined.includes(listener)), 'the disposer released the exception hook');
    t.equal(afterOff.length, before.length, 'and left the channel as it found it');
    const seen: unknown[] = [];
    const decoy = (error: unknown): void => void seen.push(error);
    process.on('uncaughtException', decoy);
    const linesAfterOff = lines.length;
    const exitsAfterOff = exited.length;
    try {
        process.emit('uncaughtException', new Error('after off'));
    } finally {
        process.off('uncaughtException', decoy);
    }
    t.equal(seen.length, 1, 'the event was emitted');
    t.equal(lines.length, linesAfterOff, 'a failure after the disposer is not recorded');
    t.equal(exited.length, exitsAfterOff, 'and does not exit through the released logger');
    t.end();
});

t.test('a predecessor is not drained by fatal, but the fatal record is on disk when fatal returns', async t => {
    // The honest contract (see the `captureProcessFailures` doc): the fatal
    // record is retained synchronously through `putSync`; writes already queued
    // are not drained, because a synchronous flush of an asynchronous write
    // contract is a contradiction. The test pins both halves — a synchronous
    // drain would write the predecessor too, and a missing `putSync` would leave
    // the fatal record absent — by reading the store before the loop turns.
    const dir = await mkdtemp(join(tmpdir(), 'semantic-log-logger-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 10});
    const {lines, writer} = capture();
    const exited: number[] = [];
    const logger = createLogger({service: 'hub', writer, cache, exit: code => void exited.push(code)});
    logger.info('predecessor');
    logger.fatal('unrecoverable');
    const idOf = (line: string): string => /r=semantic-log:\/\/record\/([0-9A-Z]+)/.exec(line)?.[1] ?? '';
    const predecessor = idOf(lines[0]);
    const fatal = idOf(lines[1]);
    t.ok(predecessor && fatal, 'both records carry their references');
    t.ok(existsSync(join(dir, 'records', `${fatal}.json`)), 'the fatal record is retained before fatal returns');
    t.notOk(
        existsSync(join(dir, 'records', `${predecessor}.json`)),
        'the earlier queued write is not drained by fatal',
    );
    t.same(exited, [1], 'the exit is still immediate');
    await logger.flush();
    t.ok(existsSync(join(dir, 'records', `${predecessor}.json`)), 'the queued write runs once the loop turns');
    await cache.close();
});

t.test('a fatal payload that cannot be serialised still reports, in json mode', t => {
    // In json mode `fatal` is what the process-failure hooks call, so a throw
    // out of the render escapes the `uncaughtException` listener and aborts Node
    // instead of reporting the failure. The render boundary makes `fatal` total.
    const {lines, writer} = capture();
    const exited: number[] = [];
    const logger = createLogger({service: 'hub', writer, format: 'json', exit: code => void exited.push(code)});
    const hostile = {
        toJSON: (): never => {
            throw new Error('toJSON exploded');
        },
    };
    t.doesNotThrow(() => logger.fatal('uncaughtException', {err: hostile}), 'a logging call must never throw');
    t.same(exited, [1], 'the exit still runs');
    const record = JSON.parse(lines[0]) as {msg: string; service: string};
    t.equal(record.msg, 'uncaughtException', 'the failure is reported through the reconstructed record');
    t.equal(record.service, 'hub');
    t.end();
});

t.test('an out-of-range clock cannot throw out of the log call', t => {
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer, now: () => 1e18});
    t.doesNotThrow(() => logger.info('x'));
    t.match(lines[0], /^\[time withheld\] /, 'the unrenderable instant is marked');
    t.match(lines[0], /hub x/, 'and the record itself is still reported');
    t.end();
});

t.test('a salvaged line stays a single line when the message and service carry newlines', t => {
    // The salvage path rebuilt its line by interpolating the caller's text raw,
    // so the multi-line record the renderer refuses to produce came back through
    // the fallback: a `\n` in the message split a header that a fixed-pattern
    // extractor cannot tell from two records. Reachable from the front door — an
    // out-of-range clock is enough to defeat the ordinary render.
    const {lines, writer} = capture();
    createLogger({service: 'hu\nb', writer, now: () => 1e18}).info('first\nsecond');
    // The writer terminates each record with a `\n` (`logger.ts`), so the
    // salvaged *record* is the chunk before that terminator. Splitting the whole
    // chunk would count the terminator as a second line and report a multi-line
    // record that is not there; the assertion below stays falsifiable because a
    // genuinely split record leaves two lines after the terminator is removed.
    const salvaged = lines[0].replace(/\n$/, '');
    t.equal(salvaged.split('\n').length, 1, 'the salvaged header is one line too');
    t.match(salvaged, /hu b first second/, 'the newlines are neutralised in both, not printed');
    t.end();
});

t.test('a write limit below one is rejected at construction, not miscounted', async t => {
    // `writeLimit: 0` used to run `queue.shift()` on an empty queue while still
    // holding one write: a drop was counted that never happened, and the bound
    // meant one rather than none. There is no reading of zero that can be
    // honoured — a queued write has to be held by something — so it is refused
    // where the logger is built. `NaN` is refused by the same test, since every
    // comparison against it is false and the bound would not apply at all.
    t.throws(() => createLogger({service: 'hub', writeLimit: 0}), /writeLimit must be a positive number/, 'zero');
    t.throws(() => createLogger({service: 'hub', writeLimit: -1}), /writeLimit must be a positive number/, 'negative');
    t.throws(() => createLogger({service: 'hub', writeLimit: Number.NaN}), /writeLimit must be a positive number/, 'NaN');
    t.doesNotThrow(() => createLogger({service: 'hub', writeLimit: 1}), 'one is the smallest limit that means something');
    t.end();
});

t.test('a withheld error reaches escalation with its message and frames', t => {
    // R10's acceptance is "hit a failure, and still produce the detail leading
    // up to it". An `Error` in the withheld bag used to escalate as `"err":{}` —
    // `message` and `stack` are non-enumerable, so `JSON.stringify` saw an empty
    // object — which defeated the most natural payload of all.
    for (const format of ['human', 'json'] as const) {
        const {lines, writer} = capture();
        const logger = createLogger({service: 'hub', writer, format});
        logger.withhold({step: 'persisting', err: new Error('connection reset by peer')});
        logger.escalate();
        const line = lines[0];
        t.match(line, /connection reset by peer/, `${format}: the message survives escalation`);
        t.match(line, /at /, `${format}: at least the first stack frame survives too`);
        if (format === 'json') {
            const record = JSON.parse(line) as LogRecord;
            const entries = record.fields?.withheld as Array<{fields: {err: ErrorDetail}}>;
            t.equal(entries[0].fields.err.type, 'Error', 'the error type is carried');
            t.match(entries[0].fields.err.stack ?? '', /\n\s+at /, 'the frames are preserved');
        }
    }
    t.end();
});

t.test('the record reference keeps its shape under a pattern naming identity', t => {
    // `id` is structural: the logger restores `refs.record` from it. A pattern
    // that replaced it made every record share one reference — and therefore one
    // cache file name, which the first prune deleted.
    for (const pattern of ['id', '**'] as const) {
        const {lines, writer} = capture();
        const logger = createLogger({service: 'hub', writer, format: 'json', redact: [pattern]});
        logger.info('one');
        logger.info('two');
        const first = JSON.parse(lines[0]) as LogRecord;
        const second = JSON.parse(lines[1]) as LogRecord;
        t.match(first.refs.record, /^[0-9A-Z]{26}$/, `${pattern}: the reference is a minted ULID`);
        t.equal(first.refs.record, first.id, `${pattern}: it points at the record`);
        t.not(first.refs.record, second.refs.record, `${pattern}: two records never share a file name`);
    }
    t.end();
});

t.test('messageId and operation reach the header, not the field bag', t => {
    // R20's normative header details were unreachable through the front door:
    // `emit` left them in `fields`, where they rendered as ordinary detail lines.
    const {lines, writer} = capture();
    createLogger({service: 'hub', writer}).info('quoted', {messageId: 'msg-7', operation: 'quote.create'});
    t.match(lines[0], /^[^\n]*info {2}hub msg-7 quote\.create quoted/, 'both details are header tokens');
    t.notMatch(lines[0], /messageId: /, 'the message id is not also a field line');
    t.notMatch(lines[0], /operation: /, 'nor is the operation');
    t.end();
});

t.test('a caller field named withheld cannot overwrite the escalation payload', t => {
    // The escalation payload is what R10's release exists for; it must win over
    // a caller's own field of the same name.
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer});
    logger.withhold({secret: 'A'});
    logger.error('x', {withheld: 'OVERWRITE'});
    t.match(lines[0], /"secret":"A"/, 'the released detail is what the record carries');
    t.notMatch(lines[0], /OVERWRITE/, 'the caller cannot replace it');
    t.end();
});

t.test('a hostile trace id cannot forge a record reference in the rendered group', t => {
    // A trace id commonly arrives from an inbound `traceparent` header. Raw, it
    // closed the reference group and forged a second record reference that a
    // fixed-pattern extractor picked up as the record's own.
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer});
    bindTrace('x] [r=semantic-log://record/ATTACKER', () => logger.info('m'));
    const extracted = [...lines[0].matchAll(/r=semantic-log:\/\/record\/[0-9A-Z]+/g)];
    t.equal(extracted.length, 1, 'exactly one record reference is extractable');
    t.notMatch(lines[0], /r=semantic-log:\/\/record\/ATTACKER/, 'and it is not the attacker-chosen one');
    t.match(lines[0], /x=semantic-log:\/\/trace\/x%5D%20%5Br%3D/, 'the trace id is percent-encoded');
    t.end();
});

t.test('a hung store cannot grow the write queue past its bound', async t => {
    // A store that never answers must cost bounded memory. The queue counts only
    // writes still queued — the one in flight is held by the store — and every
    // drop is reported on later records, the way ring-buffer overflow is.
    let put = 0;
    const hung: RecordStore = {
        put: (): Promise<void> => {
            put++;
            return new Promise<void>(() => {});
        },
        putSync: (): void => {},
        get: async (): Promise<LogRecord | undefined> => undefined,
        stats: (): {size: number; dropped: number} => ({size: 0, dropped: 0}),
        close: async (): Promise<void> => {},
    };
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', level: 'trace', writer, cache: hung, writeLimit: 8});
    for (let i = 0; i < 100; i++) {
        logger.trace('burst', {i});
    }
    // The next record carries the running total: 100 queued against a bound of
    // 8 leaves 92 dropped.
    logger.trace('after');
    t.match(lines[100], /writeDropped: 92/, 'the overflow is counted, not silent');
    await new Promise<void>(resolve => setImmediate(resolve));
    t.equal(put, 1, 'one write is in flight; the rest of the bound stays queued behind the hung store');
    t.notOk(lines[0].includes('writeDropped'), 'a record written before any drop does not claim one');
    t.end();
});

t.test('a healthy store never drops a write', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'semantic-log-logger-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 10});
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer, cache});
    for (let i = 0; i < 5; i++) {
        logger.info(`line ${i}`);
    }
    await logger.flush();
    t.equal(lines.length, 5, 'every record reached the writer');
    t.notMatch(lines.join('\n'), /writeDropped/, 'no drop is accounted against a store that answers');
    t.equal(cache.stats().dropped, 0);
    await cache.close();
});

t.test('a sink is appended to the writer and never displaces it', t => {
    const primary = capture();
    const sinkLines: string[] = [];
    const sinkRecords: Array<LogRecord | undefined> = [];
    const logger = createLogger({
        service: 'hub',
        writer: primary.writer,
        sinks: [
            {
                write: (line: string, record?: LogRecord): void => {
                    sinkLines.push(line);
                    sinkRecords.push(record);
                },
            },
        ],
    });
    logger.info('two places');
    t.equal(primary.lines.length, 1, 'the primary writer still receives the record');
    t.match(primary.lines[0], /info {2}hub two places/, 'the primary writer receives the rendered line');
    t.same(sinkLines, primary.lines, 'the sink receives the same line, not a second rendering');
    t.ok(sinkRecords[0], 'the sink also receives the structured record, so it need not parse the line');
    t.equal(sinkRecords[0]?.service, 'hub', 'the record the sink sees is the one that was rendered');
    t.end();
});

t.test('a lone destination is written to directly, so its failure still reaches the caller', t => {
    // Deliberate: the fan-out exists to keep destinations from breaking one
    // another, and there is nothing to isolate a lone destination from. Writing
    // it directly keeps the pre-fan-out semantics — a broken stdout is the
    // caller's problem, not something silently swallowed — and allocates no
    // fan-out. Routing the lone writer through a fan-out would swallow this throw
    // and make the assertion below pass for the wrong reason.
    const dead: Writer = {
        write: (): void => {
            throw new Error('stdout is gone');
        },
    };
    t.throws(() => createLogger({service: 'hub', writer: dead}).info('x'), /stdout is gone/);
    t.end();
});

t.test('a broken primary beside a sink is isolated, and the sink still receives', t => {
    // With more than one destination the write goes through the fan-out, so the
    // primary's failure is swallowed rather than reaching the caller and the sink
    // still gets the line on the other side of it. That is the isolation the
    // fan-out buys, and it is the deliberate difference from the lone case above.
    // The second emit also pins that the fan-out is composed once and reused
    // rather than rebuilt per record.
    const dead: Writer = {
        write: (): void => {
            throw new Error('stdout is gone');
        },
    };
    const sink = capture();
    const logger = createLogger({service: 'hub', writer: dead, sinks: [sink.writer]});
    t.doesNotThrow(() => logger.info('first'), 'the primary throw does not escape the log call');
    logger.info('second');
    t.equal(sink.lines.length, 2, 'both records reached the sink despite the dead primary');
    t.match(sink.lines[0], /first/, 'the first line is the first record');
    t.match(sink.lines[1], /second/, 'and the second line is the second record');
    t.end();
});

t.test('the silence sentinel silences every sink too, and stays total', t => {
    const sink = capture();
    setWriter(null);
    try {
        // No explicit `writer`, so the process-wide sentinel is consulted, and
        // the sink must be silenced with it rather than surviving as a
        // per-sink mute.
        createLogger({service: 'hub', sinks: [sink.writer]}).info('nobody hears this');
        // The same reading for an explicit `null`: it means "no output at all",
        // not "no output on the primary destination".
        createLogger({service: 'hub', writer: null, sinks: [sink.writer]}).info('nor this');
    } finally {
        setWriter(stdoutWriter);
    }
    t.equal(sink.lines.length, 0, 'a silenced logger writes to none of its sinks');
    t.end();
});

t.test('consecutive records in one scope are chained parent to child (PRD R7)', async t => {
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer});
    logger.info('first');
    logger.info('second');
    logger.info('third');
    const ids = lines.map(line => /r=semantic-log:\/\/record\/([0-9A-Z]+)/.exec(line)?.[1] ?? '');
    t.ok(ids[0] && ids[1] && ids[2], 'every line carries an id');
    t.notMatch(lines[0], /p=/, 'the first record has no parent');
    t.match(lines[1], new RegExp(`p=${ids[0]}`), 'the second points at the first');
    t.match(lines[2], new RegExp(`p=${ids[1]}`), 'the third points at the second');
    t.end();
});

t.test('a chain does not leak across sibling scopes', async t => {
    // The branches are invoked in call order and neither awaits before its
    // emit, so the first line is `branch a`. Two defects made the brief's
    // version vacuous: its `(async () => logger.info(...))` entries were never
    // called — `Promise.all` received functions, awaiting which resolves
    // immediately — so nothing was ever emitted, and `withParent.length <= 1`
    // passes for zero parented lines as well as one. Invoking the branches and
    // asserting the documented outcome exactly ("the first sibling inherits
    // nothing; the second inherits the first") gives the test the power to fail.
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer});
    await Promise.all([(async () => logger.info('branch a'))(), (async () => logger.info('branch b'))()]);
    t.equal(lines.length, 2, 'both branches emitted');
    const id = (index: number): string =>
        /r=semantic-log:\/\/record\/([0-9A-Z]+)/.exec(lines[index])?.[1] ?? '';
    const parent = (index: number): string | undefined => /p=([0-9A-Z]+)/.exec(lines[index])?.[1];
    t.equal(parent(0), undefined, 'the first sibling inherits nothing');
    t.equal(parent(1), id(0), 'the second sibling inherits the first');
    t.end();
});

t.test('a causal chain survives a step boundary (PRD R7)', async t => {
    // The fixtures this plan builds emit records *inside* a `step` and again
    // after it returns. A chain that only works in one flat synchronous scope
    // would name the record that preceded the step as the parent of the record
    // after it, silently dropping every record the step emitted — so the full
    // causal chain would not be reconstructible from records alone, which is
    // R7's acceptance. This pins the boundary the ambient memory has to cross.
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer});
    await withFlow({id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', kind: 'transfer.single'}, async () => {
        logger.info('before');
        await step('quote', async () => {
            logger.info('during');
        });
        logger.info('after');
    });
    const id = (index: number): string => /r=semantic-log:\/\/record\/([0-9A-Z]+)/.exec(lines[index])?.[1] ?? '';
    const parent = (index: number): string | undefined => /p=([0-9A-Z]+)/.exec(lines[index])?.[1];
    t.equal(lines.length, 3, 'all three records were written');
    t.equal(parent(0), undefined, 'the first record has no parent');
    t.equal(parent(1), id(0), 'the record inside the step points at the record before it');
    t.equal(parent(2), id(1), 'the record after the step points at the last record, inside the step');
    t.not(parent(2), id(0), 'it does not skip the step and point at the pre-step record');
    t.end();
});

t.test('a record with no parent carries no parent key on the wire', t => {
    const {lines, writer} = capture();
    createLogger({service: 'hub', writer, format: 'json'}).info('solo');
    const refs = (JSON.parse(lines[0]) as {refs: Record<string, unknown>}).refs;
    t.notOk('parent' in refs, 'an absent link is absent, not null or a placeholder');
    t.end();
});
