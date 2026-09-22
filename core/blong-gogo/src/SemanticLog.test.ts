import type {IMeta} from '@feasibleone/blong/types';
import {CALLS_CAPABILITY, withCapability} from '@feasibleone/semantic-log/capability';
import * as vocabulary from '@feasibleone/semantic-log/emitter';
import {
    cachePaths,
    cacheRecordIds,
    getWriter,
    openCache,
    setWriter,
} from '@feasibleone/semantic-log/emitter';
import {startService} from '@feasibleone/semantic-log/service';
import {readFileSync} from 'node:fs';
import {mkdtemp, rm} from 'node:fs/promises';
import {homedir, tmpdir} from 'node:os';
import {join} from 'node:path';
import t from 'tap';
import {
    attachSemanticVocabulary,
    currentIdentity,
    declareCall,
    isFlowId,
    runInFlow,
} from './semanticContext.ts';
import SemanticLog, {resolveHome} from './SemanticLog.ts';
import {toLogCall} from './semanticRecord.ts';

// The framework reaches the emitter's vocabulary by attachment — the emitter's
// context is Node-only, and the *shared* realm machinery that the browser bootstrap
// loads reaches this module too, so a static import would put `node:fs` in the page.
// A tap process therefore attaches it exactly as `loadServer.ts` does; without this
// the identity helpers degrade to "no identity" and the flow tests below see records
// with no execution, no call and no position.
attachSemanticVocabulary(vocabulary);

// The emitter's writer is process-wide, and these tests assert on records rather
// than on stdout, so the destination drops the line instead of printing it. A
// dropping writer rather than `null`: an explicit silence silences the logger's
// sinks with it — deliberately, see `logger.test.ts` — and the cluster sink is
// one of the things under test here.
const RESTORE_WRITER = getWriter();
setWriter({write: () => undefined});
t.teardown(() => setWriter(RESTORE_WRITER));

t.test('a cache configured without a bound takes the default', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'blong-semantic-log-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const log = new SemanticLog({level: 'info', cache: {dir}});
    await log.init();
    const at = log.logger('info', {name: 'default'});
    at.info?.('bounded by default');
    await log.stop();
    t.equal(log.store.stats().size, 1, 'the default bound retains a record comfortably');
});

t.test('the home-relative cache path the framework uses is expanded', t => {
    // The framework's own configuration names the shared log cache as
    // `~/.blong/log-cache`, and the pino transport expands that itself — so a
    // configuration that went unexpanded would create a literal `~` directory
    // beside the working directory rather than sharing the cache.
    t.equal(resolveHome('~/.blong/log-cache'), join(homedir(), '.blong/log-cache'));
    t.equal(resolveHome('/var/log/blong'), '/var/log/blong', 'an absolute path is left alone');
    t.end();
});

t.test('the argument adapter lifts the framework envelope into the record slots', t => {
    // The pino shapes themselves are the shared dialect's business, and are covered
    // where it lives (`semantic-log`'s `logCall.test.ts`). What is the framework's
    // own is `$meta`: the text becomes the message, and the two fields the
    // framework's pino formatter used to print beside it become the record's own
    // slots.
    const envelope = toLogCall([
        {
            $meta: {mtid: 'request', method: 'subject.subjectModelList'},
            message: 'no model',
            extra: 1,
        },
    ]);
    t.equal(envelope.msg, 'no model');
    t.equal(envelope.fields.operation, 'subject.subjectModelList');
    t.equal(envelope.fields.messageId, 'request');
    t.equal(envelope.fields.extra, 1);
    t.equal(
        '$meta' in envelope.fields,
        true,
        'the envelope itself is carried through, not dropped',
    );

    // The envelope wins over the same keys on the bag: it is the structured source.
    const overridden = toLogCall([
        {
            operation: 'beside',
            messageId: 'beside',
            $meta: {mtid: 'event', method: 'subject.subjectAdd'},
        },
    ]);
    t.equal(overridden.fields.operation, 'subject.subjectAdd');
    t.equal(overridden.fields.messageId, 'event');

    // A call without the envelope is the shared dialect's answer, unchanged — and
    // carries no `$meta` field at all.
    t.same(toLogCall([{database: 'blong'}, 'created missing database']), {
        msg: 'created missing database',
        fields: {database: 'blong'},
    });
    t.end();
});

t.test('the level binding falls through to every level below it', async t => {
    const log = new SemanticLog({level: 'info'});
    const at = log.logger('info', {name: 'registry'});
    t.ok(at.info && at.warn && at.error && at.fatal, 'info and everything below it is bound');
    // The original implementation's switch has no `break`s, and call sites depend
    // on it: an absent `debug` is what makes `this.log?.debug?.()` a no-op above
    // the threshold rather than a call that logs.
    t.equal(at.debug, undefined, 'debug is above the threshold, so it is not bound');
    t.equal(at.trace, undefined);
    const fatalOnly = log.logger('fatal', {name: 'registry'});
    t.ok(fatalOnly.fatal);
    t.equal(fatalOnly.error, undefined, 'only the level asked for, and below it');
    await log.stop();
});

t.test('a pino-shaped call becomes one record with the envelope in its slots', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'blong-semantic-log-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const log = new SemanticLog({level: 'info', cache: {dir, limit: 10}});
    await log.init();
    const at = log.logger('info', {name: 'registry'});
    at.info?.({$meta: {mtid: 'event', method: 'subject.subjectModelList'}, message: 'no model'});
    await log.stop();

    const cache = await openCache({dir, limit: 10, readOnly: true});
    const [id, ...rest] = await cacheRecordIds(dir);
    const record = id === undefined ? undefined : await cache.get(id);
    t.equal(rest.length, 0, 'one call is one record');
    t.equal(record?.msg, 'no model', "the envelope's text is the message");
    t.equal(record?.operation, 'subject.subjectModelList', 'the method became the operation');
    t.equal(record?.messageId, 'event', 'the mtid became the message id');
    t.equal(record?.service, 'blong', 'the framework names the service');
    t.equal(record?.context, 'registry', 'and the header names the component that logged');
    t.equal(record?.levelName, 'info');
    await cache.close();
});

t.test('a logger handed to a third party speaks pino, not the emitter', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'blong-semantic-log-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const log = new SemanticLog({level: 'info', cache: {dir, limit: 10}});
    await log.init();
    // What fastify does with the logger it is handed: a request object and a
    // message beside it. Left untranslated it lands in the emitter's message slot,
    // where the identity step masks it as text and throws — which is exactly what
    // happened the first time a realm was loaded with this logger selected.
    const child = log.child({name: 'fastify'});
    child.info({req: {url: '/x'}}, 'incoming request');
    await log.stop();

    const cache = await openCache({dir, limit: 10, readOnly: true});
    const [id] = await cacheRecordIds(dir);
    const record = id === undefined ? undefined : await cache.get(id);
    t.equal(record?.msg, 'incoming request', 'the message is the text, not the object');
    // `req` is one of the slots the emitter lifts out of the bag, so the request
    // the framework handed over is a slot of the record rather than a field of it.
    t.same(record?.req, {url: '/x'}, 'and the object is retained as the request slot');
    await cache.close();
});

t.test('each component is named in the header, and all retain through one store', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'blong-semantic-log-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const log = new SemanticLog({level: 'info', cache: {dir, limit: 10}});
    await log.init();
    log.logger('info', {name: 'gateway'}).info?.('from the gateway');
    log.logger('info', {name: 'registry'}).info?.('from the registry');
    log.logger('info', {name: 'gateway'}).info?.('again from the gateway');
    await log.stop();

    const cache = await openCache({dir, limit: 10, readOnly: true});
    const contexts: Array<string | undefined> = [];
    for (const id of await cacheRecordIds(dir)) {
        const record = await cache.get(id);
        if (record) {
            contexts.push(record.context);
        }
    }
    t.same(contexts.sort(), ['gateway', 'gateway', 'registry'], 'every record names its component');
    t.equal(log.store.stats().size, 3, 'and they all retained through the one store');
    await cache.close();
});

t.test('nothing is retained without a cache, and the logger still works', async t => {
    const log = new SemanticLog({level: 'info'});
    const at = log.logger('info', {name: 'registry'});
    t.doesNotThrow(() => at.info?.('no cache configured'));
    await log.stop();
});

t.test('the store reads back what the logger retained', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'blong-semantic-log-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const log = new SemanticLog({level: 'info', cache: {dir, limit: 10}});
    await log.init();
    t.same(log.store.stats(), {size: 0, dropped: 0}, 'an empty store reports nothing retained');
    const at = log.logger('info', {name: 'registry'});
    at.info?.('retained');
    await log.stop();
    t.equal(log.store.stats().size, 1, 'the record is retained');
    const [id] = await cacheRecordIds(dir);
    t.equal(
        (await log.store.get(id ?? ''))?.msg,
        'retained',
        'and readable back through the store',
    );

    // The payload half is bounded and counted on its own, and the synchronous
    // pair is what a `fatal` uses — the same two halves the emitter writes.
    await log.store.putPayload('01PAY', 1, '{"a":1}');
    t.same(await log.store.getPayload('01PAY'), {a: 1});
    log.store.putPayloadSync('01PAYS', 1, '{"b":2}');
    t.same(await log.store.getPayload('01PAYS'), {b: 2});
    // The staged payload resolves but is not yet in the store's count: the same
    // distinction the cache itself draws for a synchronously written record.
    t.equal(log.store.payloadStats().size, 1, 'the stored payload is counted');
    await log.store.close();
});

t.test('without a cache, every retention call is a no-op', async t => {
    const log = new SemanticLog({level: 'info'});
    await log.init();
    const record = {
        id: '01X',
        time: 1,
        level: 30,
        levelName: 'info',
        msg: 'x',
        service: 'blong',
        refs: {record: '01X'},
    };
    t.same(log.store.stats(), {size: 0, dropped: 0});
    t.same(log.store.payloadStats(), {size: 0, dropped: 0});
    t.equal(await log.store.get('01X'), undefined);
    t.equal(await log.store.getPayload('01X'), undefined);
    // Retention is an aid, never a precondition: a logger with no cache still
    // renders and still accepts every call.
    await log.store.put(record);
    log.store.putSync(record);
    await log.store.putPayload('01P', 1, '{}');
    log.store.putPayloadSync('01P', 1, '{}');
    await log.store.close();
    t.pass('none of them threw');
});

t.test('every level is bound, and emits at its own level', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'blong-semantic-log-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const log = new SemanticLog({level: 'trace', cache: {dir, limit: 10}});
    await log.init();
    t.ok(log.child({component: 'x'}), 'a child logger is handed back');
    const at = log.logger('trace', {name: 'levels'});
    at.trace?.('t');
    at.debug?.('d');
    at.info?.('i');
    at.warn?.('w');
    at.error?.('e');
    at.fatal?.('f');
    await log.stop();

    const cache = await openCache({dir, limit: 10, readOnly: true});
    const levels: string[] = [];
    for (const id of await cacheRecordIds(dir)) {
        const record = await cache.get(id);
        if (record) {
            levels.push(record.levelName);
        }
    }
    // `fatal` is written synchronously, so it is staged rather than stored: it is
    // the one level whose record survives an exit that drains no I/O, and it
    // reaches the store on the next open. The other five take the queued path.
    t.same(levels.sort(), ['debug', 'error', 'info', 'trace', 'warn']);
    const staged = readFileSync(cachePaths.sidecarFile(dir), 'utf8')
        .trim()
        .split('\n')
        .map(line => JSON.parse(line) as {json: string})
        .map(entry => JSON.parse(entry.json) as {levelName: string});
    t.same(
        staged.map(entry => entry.levelName),
        ['fatal'],
        'the fatal record is staged, not stored',
    );
    await cache.close();
});

t.test('fatal logs without ending the process', async t => {
    // The emitter's own `fatal` writes a record and then calls `exit`, because
    // its process-failure hooks install it that way. The framework's `fatal` has
    // always meant "log this at fatal level", so the exit is replaced. If that
    // replacement were dropped, this test would take the whole runner down with
    // it rather than fail — which is the point of asserting it.
    const log = new SemanticLog({level: 'fatal'});
    const at = log.logger('fatal', {name: 'registry'});
    t.doesNotThrow(() => at.fatal?.('unrecoverable'));
    await log.stop();
});

t.test('a record made inside a flow names the flow, the call and the position', async t => {
    // The whole point of the framework's mapping: a handler's existing log calls
    // say which execution and which call they were made in without the handler
    // knowing anything about it.
    const dir = await mkdtemp(join(tmpdir(), 'blong-semantic-log-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const log = new SemanticLog({level: 'info', cache: {dir}});
    await log.init();
    const meta = {mtid: 'request', method: 'access.user.find'} as IMeta;
    runInFlow(meta, 'access.user.find', () =>
        declareCall(
            'access.db',
            'party.subject.find',
            () => {
                log.logger('info', {name: 'srv.subject'}).info?.('inside the call');
            },
            meta,
        ),
    );
    await log.stop();
    t.match(
        meta.forward?.['x-semantic-trace'] ?? '',
        /flow=[0-9A-Z]{26}/,
        'the call carries the execution it belongs to',
    );
    const [id] = await cacheRecordIds(dir);
    const record = (await log.store.get(id ?? '')) as unknown as {
        flow?: {id?: string; leg?: string; legFrom?: string; legTo?: string; legSeq?: string};
    };
    t.equal(
        record.flow?.leg,
        'party.subject.find',
        'the record names the call it was made in, by the method it was made by',
    );
    t.equal(record.flow?.legFrom, 'access.db', 'and the unit that made it, beside the method');
    t.equal(record.flow?.legTo, 'party', 'and the participant the caller aimed at');
    t.match(String(record.flow?.legSeq), /^[0-9]+$/, 'and its position in the execution');
    t.equal(isFlowId(record.flow?.id), true, 'and the execution it is part of');
});

t.test('the records of a flow reach the cluster service and come back as a diagram', async t => {
    // The whole point of running the service in the process: what a run just did
    // is answerable, without a second process and without the run telling it
    // anything beyond the records it already writes.
    const dir = await mkdtemp(join(tmpdir(), 'blong-semantic-log-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const service = await startService({port: 0});
    t.teardown(async () => service?.stop());
    const log = new SemanticLog({
        level: 'info',
        cache: {dir},
        cluster: {url: service?.url ?? ''},
    });
    await log.init();
    const meta = {mtid: 'request', method: 'access.user.find'} as IMeta;
    const identity = runInFlow(meta, 'access.user.find', () =>
        declareCall(
            'access.db',
            'party.subject.find',
            () => {
                log.logger('info', {name: 'srv.subject'}).info?.('querying the party');
                return currentIdentity();
            },
            meta,
        ),
    );
    await log.stop();
    const flows = await service?.app.inject({method: 'GET', url: '/flows'});
    t.equal(flows?.statusCode, 200, 'the service answers');
    t.equal(
        (flows?.json() as {executions: {id: string}[]}).executions.length > 0,
        true,
        'and it has observed the execution the run made',
    );
    const diagram = await service?.app.inject({
        method: 'GET',
        url: `/flows/${identity.flow ?? ''}/diagram`,
    });
    t.equal(diagram?.statusCode, 200, 'the execution can be drawn from the records alone');
    t.match(
        diagram?.body ?? '',
        /party\.subject\.find/,
        'and the drawing names the call the caller declared, by its method',
    );
});

t.test('a configured cluster is started beside the logger and stopped with it', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'blong-semantic-log-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const persistTo = join(dir, 'service.json');
    const log = new SemanticLog({level: 'info', cluster: {enabled: true, port: 0, persistTo}});
    await log.init();
    log.logger('info', {name: 'cluster-test'}).info?.('the service is beside me');
    await log.stop();
    t.match(
        readFileSync(persistTo, 'utf8'),
        /fingerprint/,
        'the registry the started service changed is on disk, so it ran and took the record',
    );
});

/**
 * The call channel's destination: stored, not shown, unless asked for.
 *
 * The lines are collected by replacing the emitter's process-wide writer, which
 * is the seam a test silences output with — and the reason the channel's own
 * writer forwards to it rather than holding stdout.
 */
function collectingWriter(sink: string[]): {write: (line: string) => void} {
    return {
        write: (line: string): void => {
            sink.push(line);
        },
    };
}

t.test('a call record is retained without being printed', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'blong-semantic-log-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const printed: string[] = [];
    const RESTORE = getWriter();
    setWriter(collectingWriter(printed));
    t.teardown(() => setWriter(RESTORE));

    const log = new SemanticLog({level: 'info', cache: {dir}});
    await log.init();
    const calls = log.logger('info', {name: 'gateway'}).calls;
    withCapability(CALLS_CAPABILITY, true, () => {
        calls?.start('gateway.access.access.find');
        calls?.end('gateway.access.access.find');
    });
    await log.stop();

    t.equal(
        printed.filter(line => line.includes('call ')).length,
        0,
        'nothing about the call reached the destination',
    );
    t.equal(log.store.stats().size, 2, 'while both records are retained');
});

t.test('the same records print when stdout was asked for', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'blong-semantic-log-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const printed: string[] = [];
    const RESTORE = getWriter();
    setWriter(collectingWriter(printed));
    t.teardown(() => setWriter(RESTORE));

    const log = new SemanticLog({level: 'info', cache: {dir}, calls: {stdout: true}});
    await log.init();
    withCapability(CALLS_CAPABILITY, true, () =>
        log.logger('info', {name: 'gateway'}).calls?.start('a.b'),
    );
    await log.stop();

    t.equal(
        printed.filter(line => line.includes('call start: a.b')).length,
        1,
        'the call is shown',
    );
    t.equal(log.store.stats().size, 1, 'and still stored');
});

t.test('an opted-out flow writes and shows nothing', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'blong-semantic-log-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const printed: string[] = [];
    const RESTORE = getWriter();
    setWriter(collectingWriter(printed));
    t.teardown(() => setWriter(RESTORE));

    const log = new SemanticLog({level: 'info', cache: {dir}, calls: {stdout: true}});
    await log.init();
    const calls = log.calls;
    t.equal(calls?.enabled(), false, 'no flow is in scope, so nothing is recorded');
    withCapability(CALLS_CAPABILITY, false, () => {
        t.equal(calls?.enabled(), false, 'and an opted-out flow says so before anything is built');
        calls?.start('a.b');
        calls?.received('a.b');
    });
    withCapability(CALLS_CAPABILITY, true, () => calls?.received('a.b'));
    await log.stop();

    t.equal(
        printed.filter(line => line.includes('call ')).length,
        1,
        'only the flow that was recorded',
    );
    t.equal(log.store.stats().size, 1, 'and only its record is retained');
});

t.test('a child logger honours the level it was asked for', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'blong-semantic-log-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const log = new SemanticLog({level: 'info', cache: {dir}});
    await log.init();
    // What `Gateway` does: a `warn` child, so a request dump is not written unless
    // it was asked for. The option used to be dropped, which is how the gateway
    // printed its own records at the root's level whatever it was configured with.
    const gateway = log.child<never>({name: 'gateway'}, {level: 'warn'});
    (gateway as unknown as {info: (msg: string) => void}).info('a request nobody asked about');
    (gateway as unknown as {warn: (msg: string) => void}).warn('a request worth reporting');
    await log.stop();
    t.equal(log.store.stats().size, 1, 'only the record at the child\u2019s level was written');
});
