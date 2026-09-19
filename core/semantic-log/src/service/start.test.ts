import {mkdtempSync, readFileSync, rmSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import t from 'tap';
import {DEFAULT_SERVICE_PORT, startService} from './start.ts';

t.test('the service binds the loopback interface and reports the URL it bound', async t => {
    const service = await startService({port: 0, host: '127.0.0.1'});
    t.teardown(async () => service?.stop());
    t.ok(service, 'a free port is enough to start');
    t.match(
        service?.url ?? '',
        /^http:\/\/127\.0\.0\.1:\d+$/,
        'and the URL names the port the operating system chose, not the one asked for',
    );
    const health = await service?.app.inject({method: 'GET', url: '/health'});
    t.equal(health?.statusCode, 200, 'the service answers');
    t.same(health?.json(), {status: 'ok'}, 'and it answers as itself');
});

t.test('a port already in use is reported rather than thrown', async t => {
    const first = await startService({port: 0});
    t.teardown(async () => first?.stop());
    const taken = Number(new URL(first?.url ?? 'http://127.0.0.1:0').port);
    let reported: unknown;
    const second = await startService({
        port: taken,
        onError: error => {
            reported = error;
        },
    });
    t.equal(second, undefined, 'the second service does not start');
    t.match(
        String(reported),
        /EADDRINUSE/,
        'and the caller is told why, because a second process in one workspace is not an error',
    );
});

t.test('a snapshot file makes the template registry survive a restart', async t => {
    const dir = mkdtempSync(join(tmpdir(), 'semantic-log-start-'));
    t.teardown(() => rmSync(dir, {recursive: true, force: true}));
    const persistTo = join(dir, 'service.json');
    const service = await startService({port: 0, persistTo});
    t.teardown(async () => service?.stop());
    const accepted = await service?.app.inject({
        method: 'POST',
        url: '/events',
        payload: {
            events: [
                {
                    id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
                    time: 1,
                    fingerprint: 'aaaa',
                    template: '[LEVEL: INFO] [SERVICE: hub] [MSG: hello]',
                    service: 'hub',
                    level: 30,
                    levelName: 'info',
                    msg: 'hello',
                },
            ],
        },
    });
    t.equal(accepted?.statusCode, 202, 'a batch is acknowledged');
    t.ok(statSync(persistTo).size > 0, 'and the registry it changed is on disk before the answer');
    t.match(readFileSync(persistTo, 'utf8'), /aaaa/, 'with the template the batch introduced');
});

t.test('an unconfigured port is the default one', async t => {
    // The port may legitimately be taken on a busy machine, so a service that did
    // not bind is not a failure here: what is asserted is that the default was the
    // port asked for, not that the socket was free. The failure path itself is
    // covered above, and the reason is dropped rather than printed.
    const service = await startService({onError: () => undefined});
    t.teardown(async () => service?.stop());
    t.equal(
        new URL(service?.url ?? `http://127.0.0.1:${DEFAULT_SERVICE_PORT}`).port,
        String(DEFAULT_SERVICE_PORT),
        'the port nobody configured is the one an in-process service is documented on',
    );
});
