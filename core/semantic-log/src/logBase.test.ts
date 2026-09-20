import {mkdtemp, rm} from 'node:fs/promises';
import {homedir, tmpdir} from 'node:os';
import {join} from 'node:path';
import t from 'tap';
import {CALLS_CAPABILITY} from './capability.ts';
import {enterCapability} from './context.ts';
import {LogBase, resolveHome, type ClusterOpener, type OpenedCluster} from './logBase.ts';
import type {LogRecord} from './record.ts';
import {getWriter, setWriter, type Writer} from './writer.ts';

// The base is the emitter's front door for an embedder, so these tests are written
// from the outside: what a runtime configures, and what it can then observe —
// a line on the process writer, a record in the store, a call on its sink.

/** Collect the lines and records the process-wide writer is handed. */
function capture(): {lines: string[]; records: LogRecord[]; writer: Writer} {
    const lines: string[] = [];
    const records: LogRecord[] = [];
    return {
        lines,
        records,
        writer: {
            write: (line: string, record?: LogRecord): void => {
                lines.push(line);
                if (record !== undefined) records.push(record);
            },
        },
    };
}

/** Replace the process-wide writer for one test, as every other test here does. */
function collect(t: {teardown: (fn: () => void) => void}): {lines: string[]; records: LogRecord[]} {
    const captured = capture();
    const restore = getWriter();
    setWriter(captured.writer);
    t.teardown(() => setWriter(restore));
    return captured;
}

t.test('the seams answer the shapes a wrapper asks with', t => {
    const {lines} = collect(t);
    const log = new LogBase({service: 'hub'});
    // A component named without a threshold, and a threshold without a name: both
    // are legitimate, and neither may silently take the root's logger.
    const byThreshold = log.componentLogger(undefined, 'warn');
    byThreshold.info('hidden');
    byThreshold.warn('threshold without a name');
    t.equal(lines.length, 1, 'a threshold without a name is its own logger');

    // The call channel for the log itself, and for a component that has no name.
    t.equal(
        log.callsLogger('gateway'),
        log.callsLogger('gateway'),
        'a component gets one call logger',
    );
    t.not(log.callsLogger('gateway'), log.callsLogger(), 'and it is not the unbound one');

    // A child with no bindings at all, and one with bindings but no options.
    log.child().info('nothing bound');
    log.child({tenant: 'acme'}).info('bindings only');
    t.equal(lines.length, 3, 'both are usable loggers');

    // A component with neither name nor threshold is the root logger, and a face
    // asked for it is still a face.
    log.componentFace(undefined, undefined, {}).info('root face');
    t.equal(lines.length, 4);
    t.end();
});

t.test('a bare log emits through the process writer and retains nothing', async t => {
    const {lines, records} = collect(t);
    const log = new LogBase({service: 'hub'});
    await log.init();
    t.teardown(() => log.stop());

    log.componentFace('realm', 'info', {}).info({database: 'hub'}, 'created missing database');
    t.equal(lines.length, 1, 'the line reached the process-wide writer');
    t.match(lines[0], /created missing database/, 'with the message the call site gave');
    t.equal(records[0]?.context, 'realm', 'and the record names the component that made it');
    t.equal(records[0]?.service, 'hub', 'and the service it configured');

    t.equal(log.store.stats().size, 0, 'nothing is retained without a cache');
    t.same(log.store.stats(), {size: 0, dropped: 0}, 'and the statistics say so');
    // Every store member is answered rather than missing: a caller that asks a
    // cacheless log to read back what it never stored gets nothing, not a throw.
    await log.store.put(records[0] as LogRecord);
    log.store.putSync(records[0] as LogRecord);
    t.equal(await log.store.get('anything'), undefined, 'a read answers nothing');
    await log.store.putPayload('id', 1, '{}');
    log.store.putPayloadSync('id', 1, '{}');
    t.equal(await log.store.getPayload('id'), undefined, 'so does a payload read');
    t.same(log.store.payloadStats(), {size: 0, dropped: 0}, 'and so do its statistics');
    await log.store.close();
    t.end();
});

t.test('a component gets one logger, and two thresholds get two', t => {
    const log = new LogBase();
    t.equal(
        log.componentLogger('realm'),
        log.componentLogger('realm'),
        'the same name is the same logger',
    );
    t.not(
        log.componentLogger('realm'),
        log.componentLogger('realm', 'warn'),
        'a threshold is its own logger',
    );
    t.not(log.componentLogger('realm'), log.componentLogger('gateway'), 'and so is a name');
    t.equal(log.componentLogger(), log.componentLogger(), 'and the unbound logger is the root');
    t.end();
});

t.test('a face reads a pino call in either order, and a child keeps its own level', t => {
    const {lines, records} = collect(t);

    const face = new LogBase().face(new LogBase().componentLogger('gateway'), 'gateway');
    // pino's canonical order and its reverse, an `Error` alone, and a bare string:
    // the emitter takes `(message, fields)`, and every face translates.
    face.info({requestId: 'r1'}, 'canonical');
    face.info('reverse', {requestId: 'r2'});
    face.error(new Error('boom'));
    face.warn('bare');
    t.equal(lines.length, 4, 'each shape produced one record');
    t.match(lines[0], /canonical/);
    t.equal(records[0]?.fields?.requestId, 'r1', 'the bag is the record fields');
    t.match(lines[1], /reverse/);
    t.equal(records[1]?.fields?.requestId, 'r2', 'and it is read in either position');
    t.match(lines[2], /boom/, 'an error is the message');
    t.match(lines[3], /bare/);

    // A child of a face carries its own bindings and names its own component, and
    // the level option is a threshold rather than decoration: a `warn` child does
    // not print an info record at the root's threshold.
    const gateway = new LogBase().componentFace('gateway', 'warn', {});
    gateway.info('hidden');
    gateway.warn('shown');
    t.equal(lines.length, 5, 'only the level the face was built at is printed');
    t.match(lines[4], /shown/);

    const root = new LogBase();
    const child = root.child({name: 'child', tenant: 'acme'}, {level: 'debug'});
    child.debug('deep');
    t.equal(lines.length, 6);
    t.equal(records[5]?.context, 'child', 'a child binding the name is that component');
    t.equal(records[5]?.fields?.tenant, 'acme', 'and its other bindings travel with it');

    // A child that binds no name keeps the component it was made from, and a child
    // of a face is the same thing one level down.
    const unnamed = root.componentFace('realm', 'info', {});
    unnamed.child({tenant: 'acme'}).info('named by its parent');
    t.equal(lines.length, 7);
    t.equal(
        records[6]?.context,
        'realm',
        'a child with no name of its own keeps the one it was made from',
    );
    t.equal(records[6]?.fields?.tenant, 'acme', 'and takes the bindings it was given');

    // A child that binds a name of its own carries it as a binding: the emitter
    // renders a record's component from its logger's context, which is fixed when
    // the logger is made, and a face's child is made from the logger it came from.
    unnamed.child({name: 'nested'}).info('renamed by its child');
    t.equal(lines.length, 8);
    t.equal(records[7]?.fields?.name, 'nested', 'a child binding a name carries it as a field');
    t.end();
});

t.test('the level is a threshold, and `fatal` does not end the process', t => {
    const {lines} = collect(t);
    const log = new LogBase({level: 'warn'});
    const face = log.componentFace('realm', 'warn', {});
    face.info('hidden');
    face.fatal('shown');
    t.equal(lines.length, 1, 'records below the threshold are not emitted at all');
    t.match(lines[0], /shown/, 'and the one above it is');
    t.end();
});

t.test('a call record reaches the store while the line stays off stdout', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'semantic-log-base-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const {lines} = collect(t);
    enterCapability(CALLS_CAPABILITY, true);
    t.teardown(() => enterCapability(CALLS_CAPABILITY, false));

    const log = new LogBase({service: 'hub', cache: {dir, limit: 10}});
    await log.init();
    const calls = log.callsChannel('gateway');
    t.equal(calls.enabled(), true, 'the gate was asked, and says yes');
    calls.start('gateway.party.partyFind', {to: 'party'});
    await log.stop();

    t.equal(lines.length, 0, 'nothing was printed: printing is the opt-in');
    t.equal(log.store.stats().size, 1, 'and the call was retained, which is not');
    t.end();
});

t.test('a call record is printed when the configuration asks for it', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'semantic-log-base-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const {lines, records} = collect(t);
    enterCapability(CALLS_CAPABILITY, true);
    t.teardown(() => enterCapability(CALLS_CAPABILITY, false));

    const log = new LogBase({
        service: 'hub',
        cache: {dir},
        calls: {stdout: true},
        // A runtime's own envelope, and the hook that puts it on every record.
        envelope: event => ({phase: event.phase, leg: event.leg}),
    });
    await log.init();
    const calls = log.callsChannel('gateway');
    calls.received('db.party.partyFind', {from: 'party'});
    calls.error('db.party.partyFind', new Error('refused'), {attempt: 2});
    await log.stop();

    t.equal(lines.length, 2, 'the opt-in printed both');
    t.equal(records[0]?.fields?.phase, 'received', 'with the envelope the runtime asked for');
    t.equal(records[0]?.fields?.from, 'party', 'and the fields the call site gave');
    t.equal(records[1]?.fields?.phase, 'error', 'a failed call is a phase of its own');
    t.equal(records[1]?.err?.message, 'refused', 'and carries the error it failed with');
    t.equal(records[1]?.fields?.attempt, 2, 'beside the fields of the call');
    t.equal(log.store.stats().size, 2, 'and both are retained as well');
    t.end();
});

t.test('the store reads and writes through the cache once it is open', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'semantic-log-base-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const {records} = collect(t);
    const log = new LogBase({service: 'hub', cache: {dir, limit: 5}});
    await log.init();
    log.componentFace('realm', 'info', {}).info('through the cache');
    const record = records[0] as LogRecord;

    // Every member the store exposes resolves through the open cache, which is what
    // makes it a *store* rather than a set of no-ops.
    log.componentFace('realm', 'info', {}).info('and again');
    log.store.putSync(record);
    await log.store.put(records[1] as LogRecord);
    t.equal((await log.store.get(record.id))?.msg, 'through the cache', 'a record reads back');
    t.ok(log.store.stats().size >= 1, 'and the store counts what it holds');
    t.ok(await log.store.get((records[1] as LogRecord).id), 'and the second record reads back too');
    await log.store.putPayload(record.id, record.time, '{"a":1}');
    log.store.putPayloadSync(record.id, record.time, '{"b":2}');
    t.same(await log.store.getPayload(record.id), {b: 2}, 'a payload reads back too');
    t.ok(log.store.payloadStats().size >= 1, 'and payloads are counted');
    await log.store.close();
    await log.stop();
    t.end();
});

t.test('the cache the log opened is where its records are retained', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'semantic-log-base-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    collect(t);
    const log = new LogBase({service: 'hub', cache: {dir, limit: 5}});
    await log.init();
    log.componentFace('realm', 'info', {}).info('retained');
    log.componentFace('realm', 'info', {}).info('retained too');
    await log.stop();
    t.equal(log.store.stats().size, 2, 'both records are in the store the cache bounds');
    t.end();
});

t.test('the home-relative cache path the emitter documents is expanded', t => {
    t.equal(resolveHome('~/.blong/log-cache'), join(homedir(), '.blong/log-cache'));
    t.equal(resolveHome('/var/log/blong'), '/var/log/blong', 'an absolute path is left alone');
    t.end();
});

t.test('a configured cluster with no opener installs no sink', async t => {
    const {lines} = collect(t);
    const log = new LogBase({service: 'hub', cluster: {url: 'http://127.0.0.1:9455'}});
    await log.init();
    log.componentFace('realm', 'info', {}).info('still emitted');
    await log.stop();
    t.equal(lines.length, 1, 'the log works; it simply has nowhere to send a copy');
    t.equal(
        log.clusterUrl,
        undefined,
        'and no address is published: this process is not running a service',
    );
    t.end();
});

t.test('an opener that starts nothing leaves the log working', async t => {
    const {lines} = collect(t);
    const log = new LogBase({
        service: 'hub',
        cluster: {enabled: true, port: 0},
        openCluster: async () => async () => undefined,
    });
    await log.init();
    log.componentFace('realm', 'info', {}).info('still emitted');
    await log.stop();
    t.equal(lines.length, 1, 'the record is on stdout whether or not a service is up');

    // And a loader that cannot name an opener at all is the same outcome: no sink,
    // no failure.
    const without = new LogBase({
        service: 'hub',
        cluster: {url: 'http://127.0.0.1:9455'},
        openCluster: async () => undefined,
    });
    await without.init();
    without.componentFace('realm', 'info', {}).info('still emitted');
    await without.stop();
    t.equal(lines.length, 2, 'a log whose cluster cannot be reached is still a log');
    t.end();
});

t.test('the sink the opener answered with takes a copy of every record', async t => {
    const {lines} = collect(t);
    const sent: string[] = [];
    let closed = 0;
    const sink: OpenedCluster['sink'] = {
        write: (line: string): void => void sent.push(line),
        flush: async (): Promise<void> => undefined,
        failed: (): number => 0,
    };
    const opener: ClusterOpener = async (_options, report) => {
        // Both stages the opener can report are reported here, so the log's own
        // account of them is exercised: a service that never started and a batch
        // the service refused.
        report(new Error('port in use'), 'start');
        report(new Error('bad request'), 'send');
        return {sink, url: 'http://127.0.0.1:43210', close: async () => void (closed += 1)};
    };
    const log = new LogBase({
        service: 'hub',
        cluster: {enabled: true, port: 0},
        openCluster: async () => opener,
    });
    await log.init();
    log.componentFace('realm', 'info', {}).info('a copy goes to the cluster');
    await log.stop();

    t.equal(sent.length, 1, 'the sink the opener answered with was used');
    t.equal(closed, 1, 'and closing the log closed what the opener opened');
    // The address is published because only this process can know it: a service
    // started on a port the operating system chose has no name to look up, and a
    // reader in the same process has to be told where the service is.
    t.equal(
        log.clusterUrl,
        'http://127.0.0.1:43210',
        'the address the sink writes to is published for this process to read',
    );
    t.match(
        lines.join('\n'),
        /was not started: Error: port in use/,
        'a start failure is reported as what it is',
    );
    t.match(
        lines.join('\n'),
        /refused a batch: Error: bad request/,
        'and a refused batch as its own',
    );
    t.end();
});
