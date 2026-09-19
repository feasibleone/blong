import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import t from 'tap';
import {createLogger} from '../logger.ts';
import type {LogRecord} from '../record.ts';
import {openCluster} from './cluster.ts';
import {startService} from './start.ts';

// The opener is the seam between the two halves of the package: a log on the
// emitter side cannot reach the service, so it takes this function and calls it.
// What it must never do is leave a caller worse off — an unreachable service is a
// log with no sink, not a failure.

/** One genuine record, taken from a logger, so the sink gets the real shape. */
function oneRecord(): LogRecord {
    let captured: LogRecord | undefined;
    createLogger({
        service: 'hub',
        writer: {
            write: (_line: string, record?: LogRecord): void => {
                captured = record;
            },
        },
    }).info('hello from the opener test');
    return captured as LogRecord;
}

t.test('an already-running service is used rather than started', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'semantic-log-cluster-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const persistTo = join(dir, 'service.json');
    const running = await startService({port: 0, persistTo});
    t.teardown(async () => running?.stop());
    const reported: Array<[unknown, string]> = [];

    const opened = await openCluster(
        {url: running?.url ?? '', sendLimit: 4},
        (error, stage) => void reported.push([error, stage]),
    );
    t.ok(opened, 'the sink was opened against the service that was already up');
    opened?.sink.write('line\n', oneRecord());
    await opened?.sink.flush();
    t.equal(opened?.sink.failed(), 0, 'and the batch was delivered');
    t.match(
        await readFile(persistTo, 'utf8'),
        /hello from the opener test/,
        'which is what put the record in the service',
    );
    t.same(reported, [], 'nothing had to be reported');

    await opened?.close();
    t.equal((await running?.app.inject({method: 'GET', url: '/health'}))?.statusCode, 200);
    t.pass('closing a sink does not stop a service it did not start');
});

t.test('a port already in use is reported as a start failure', async t => {
    const taken = await startService({port: 0});
    t.teardown(async () => taken?.stop());
    const port = Number(new URL(taken?.url ?? 'http://127.0.0.1:0').port);
    const reported: Array<[unknown, string]> = [];

    const opened = await openCluster(
        {enabled: true, port},
        (error, stage) => void reported.push([error, stage]),
    );
    t.equal(opened, undefined, 'nothing is opened');
    t.equal(reported.length, 1, 'and the reason is reported once');
    t.equal(reported[0]?.[1], 'start', 'as a start, which is what it was');
    t.match(
        String(reported[0]?.[0]),
        /EADDRINUSE/,
        'with the word the operating system uses for it',
    );
});

t.test('a service it started is the one close stops', async t => {
    const reported: Array<[unknown, string]> = [];
    const opened = await openCluster(
        {enabled: true, port: 0},
        (error, stage) => void reported.push([error, stage]),
    );
    t.ok(opened, 'a free port is enough to start one');
    opened?.sink.write('line\n', oneRecord());
    await opened?.sink.flush();
    t.equal(opened?.sink.failed(), 0, 'and it took the batch');
    t.same(reported, [], 'nothing to report while it is up');

    await opened?.close();
    opened?.sink.write('line\n', oneRecord());
    await opened?.sink.flush();
    t.equal(reported.length, 1, 'a batch after the close is the one that fails');
    t.equal(reported[0]?.[1], 'send', 'and it fails as a send, not as a start');
    t.pass('the service the opener started is the service its close stopped');
});
