import {appendFileSync} from 'node:fs';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import t from 'tap';
import {createLogger} from '../logger.ts';
import type {LogRecord} from '../record.ts';
import {createApp} from './app.ts';
import {LineageIndex} from './lineage.ts';
import type {IngestEvent} from './registry.ts';
import {createServiceWriter} from './transport.ts';

function record(overrides: Partial<LogRecord> = {}): LogRecord {
    return {
        id: '01J8Z9K2M9PQRSTVWXYZ0A1B2C',
        time: 1757765472345,
        level: 30,
        levelName: 'info',
        msg: 'transfer prepared',
        service: 'hub',
        fingerprint: 'abcdef0123456789abcdef0123456789',
        template: '[LEVEL: INFO] [SERVICE: hub] [MSG: transfer prepared]',
        refs: {record: '01J8Z9K2M9PQRSTVWXYZ0A1B2C', template: 'abcdef012345'},
        ...overrides,
    };
}

t.test('a record becomes one event posted to the ingest route', async t => {
    const calls: Array<{url: string; init: RequestInit | undefined}> = [];
    const writer = createServiceWriter({
        url: 'http://service.test/',
        fetch: (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
            calls.push({url: String(input), init});
            return new Response(null, {status: 202});
        }) as typeof fetch,
    });
    writer.write('rendered line\n', record());
    await writer.flush();

    t.equal(calls.length, 1, 'one request was sent');
    t.equal(calls[0]?.url, 'http://service.test/events', 'the trailing slash is normalised and the route is used');
    t.equal(calls[0]?.init?.method, 'POST', 'the route is posted to');
    // The assertion is on the header value, not merely that some headers object
    // exists: the route parses the body as JSON only when this is declared.
    t.match(
        calls[0]?.init?.headers,
        {'content-type': 'application/json'},
        'the body is declared as json, so the route parses it',
    );
    const body = JSON.parse(String(calls[0]?.init?.body)) as {events: IngestEvent[]};
    t.equal(body.events.length, 1, 'the batch holds the one record');
    t.equal(body.events[0]?.id, '01J8Z9K2M9PQRSTVWXYZ0A1B2C', 'the record id becomes the event id');
    t.equal(body.events[0]?.fingerprint, 'abcdef0123456789abcdef0123456789', 'the record fingerprint keys the event');
    t.equal(body.events[0]?.service, 'hub', 'the service name travels with the event');
    t.equal(writer.failed(), 0, 'a 202 is not a failure');
    t.equal(writer.dropped(), 0, 'and nothing is dropped when the queue is not full');
});

t.test('a non-2xx answer is reported, never thrown', async t => {
    const errors: unknown[] = [];
    const writer = createServiceWriter({
        url: 'http://service.test',
        fetch: (async (): Promise<Response> => new Response(null, {status: 500})) as typeof fetch,
        onError: error => void errors.push(error),
    });
    t.doesNotThrow(() => writer.write('line\n', record()), 'write never throws, even before the send settles');
    await writer.flush();
    t.equal(errors.length, 1, 'the failure was reported');
    t.match(String(errors[0]), /answered 500/, 'the report names what the service answered');
    t.equal(writer.failed(), 1, 'the record is counted as undelivered');
});

t.test('a rejected send is absorbed, counted, and does not poison the next one', async t => {
    let attempt = 0;
    const writer = createServiceWriter({
        url: 'http://service.test',
        fetch: (async (): Promise<Response> => {
            attempt++;
            if (attempt === 1) {
                throw new Error('connection refused');
            }
            return new Response(null, {status: 202});
        }) as typeof fetch,
    });
    writer.write('first\n', record());
    writer.write('second\n', record({id: '01J8Z9K2M9PQRSTVWXYZ0A1B2D'}));
    await writer.flush();
    t.equal(attempt, 2, 'the second send still ran after the first failed');
    t.equal(writer.failed(), 1, 'only the failed record is counted, with no reporter configured');
});

t.test('a reporter that throws does not poison the queue it reports on', async t => {
    let attempt = 0;
    const writer = createServiceWriter({
        url: 'http://service.test',
        fetch: (async (): Promise<Response> => {
            attempt++;
            if (attempt === 1) {
                throw new Error('boom');
            }
            return new Response(null, {status: 202});
        }) as typeof fetch,
        onError: () => {
            throw new Error('the reporter is broken too');
        },
    });
    writer.write('first\n', record());
    await writer.flush();
    writer.write('second\n', record());
    await writer.flush();
    t.equal(attempt, 2, 'the queue survived a throwing reporter');
    t.equal(writer.failed(), 1, 'and the failure is still counted');
});

t.test('a hung send cannot grow the queue past its bound', async t => {
    // A service that never answers must cost bounded memory: the queue counts
    // only sends still queued — the one in flight is held by the socket — and
    // every drop is counted rather than silent.
    let attempts = 0;
    const writer = createServiceWriter({
        url: 'http://service.test',
        sendLimit: 2,
        fetch: (async (): Promise<Response> => {
            attempts++;
            return new Promise<Response>(() => {});
        }) as typeof fetch,
    });
    for (let i = 0; i < 6; i++) {
        writer.write('burst\n', record({id: `01J8Z9K2M9PQRSTVWXYZ0A1B2${i}`}));
    }
    t.equal(writer.dropped(), 4, 'only the bound is retained; the rest are dropped, oldest first');
    t.equal(writer.failed(), 0, 'a drop is not a delivery failure');
    await new Promise<void>(resolve => setImmediate(resolve));
    t.equal(attempts, 1, 'one send is in flight, held by the socket, not by the queue');
});

t.test('a non-positive send limit is rejected at construction', t => {
    t.throws(
        () => createServiceWriter({url: 'http://service.test', sendLimit: 0}),
        /sendLimit must be a positive number/,
        'zero',
    );
    t.throws(
        () => createServiceWriter({url: 'http://service.test', sendLimit: -1}),
        /sendLimit must be a positive number/,
        'negative',
    );
    t.throws(
        () => createServiceWriter({url: 'http://service.test', sendLimit: Number.NaN}),
        /sendLimit must be a positive number/,
        'NaN',
    );
    t.end();
});

t.test('a line with no record, and a record with no fingerprint, are not sent', async t => {
    let calls = 0;
    const writer = createServiceWriter({
        url: 'http://service.test',
        fetch: (async (): Promise<Response> => {
            calls++;
            return new Response(null, {status: 202});
        }) as typeof fetch,
    });
    writer.write('just a line\n');
    writer.write('a line beside an unusable record\n', record({fingerprint: undefined}));
    await writer.flush();
    t.equal(calls, 0, 'nothing is posted without a fingerprint to key it');
    t.equal(writer.failed(), 0, 'and nothing is reported as failed');
});

t.test('a record whose refs cannot be read is skipped, never thrown', async t => {
    let calls = 0;
    const writer = createServiceWriter({
        url: 'http://service.test',
        fetch: (async (): Promise<Response> => {
            calls++;
            return new Response(null, {status: 202});
        }) as typeof fetch,
    });
    // `refs` is required by `LogRecord`, so only an untyped caller can omit it —
    // and `toEvent` dereferences it on the caller's stack. The guard has to make
    // `write` total for that caller too, so the record is skipped rather than
    // allowed to escape as a throw.
    t.doesNotThrow(
        () => writer.write('a line beside a ref-less record\n', record({refs: undefined})),
        'write never throws when the record has no refs',
    );
    await writer.flush();
    t.equal(calls, 0, 'nothing is posted without references to carry');
    t.equal(writer.failed(), 0, 'nothing is reported as failed');
    t.equal(writer.dropped(), 0, 'and nothing is counted as dropped: it was skipped, not discarded');
});

t.test('with no fetch injected, the global fetch is used', async t => {
    const original = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request): Promise<Response> => {
        calls.push(String(input));
        return new Response(null, {status: 202});
    }) as typeof fetch;
    try {
        const writer = createServiceWriter({url: 'http://service.test'});
        writer.write('line\n', record());
        await writer.flush();
        t.equal(writer.failed(), 0, 'the default transport delivered');
    } finally {
        globalThis.fetch = original;
    }
    t.same(calls, ['http://service.test/events'], 'the default transport reaches the ingest route');
});

t.test('a record reaches stdout and the service in parallel (§5.1)', async t => {
    const app = createApp({embedding: {kind: 'offline', dimension: 16}});
    t.teardown(() => app.close());
    const writer = createServiceWriter({
        url: 'http://service.test',
        fetch: (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
            // The transport's own headers are forwarded, not replaced: the
            // fixture must be faithful to the request, so a transport that
            // stopped declaring `content-type: application/json` would reach the
            // route unparsed and fail here instead of passing silently.
            const response = await app.inject({
                method: 'POST',
                url: new URL(String(input)).pathname,
                headers: init?.headers as Record<string, string>,
                payload: String(init?.body),
            });
            return new Response(null, {status: response.statusCode});
        }) as typeof fetch,
    });

    // Observe the real stdout: the logger is given no `writer`, so stdout is its
    // primary destination and the service sink is appended beside it — which is
    // exactly the §5.1 claim that stdout is always present. The emitter stays in
    // its default `human` format, so a sink that needed JSON would send nothing
    // here; this test is what proves the record is carried beside the line.
    const originalWrite = process.stdout.write;
    const written: string[] = [];
    process.stdout.write = ((chunk: unknown): boolean => {
        written.push(String(chunk));
        return true;
    }) as typeof process.stdout.write;
    try {
        createLogger({service: 'hub', sinks: [writer], now: () => 1757765472345}).info('fan-out works');
    } finally {
        process.stdout.write = originalWrite;
    }
    await writer.flush();

    t.match(written.join(''), /info {2}fan-out works/, 'stdout still carries the record');
    const templates = (await app.inject({method: 'GET', url: '/templates'})).json() as Array<{
        service: string;
        count: number;
    }>;
    t.equal(templates.length, 1, 'the service ingested the same record');
    t.equal(templates[0]?.service, 'hub', 'the service filed it under the emitting service');
    t.equal(templates[0]?.count, 1, 'and counted it once');
});

t.test('stdout, the service and a file all receive the same record (§5.1 row)', async t => {
    // The row's parenthetical is "(stdout + remote + file)". stdout+remote and
    // file+memory are driven elsewhere; this drives all three sink kinds in one
    // fan-out, with stdout as the default primary writer. The record is emitted
    // twice so the service keys the second ingest onto the first template and the
    // fan-out is proven composed once and reused rather than rebuilt per record.
    const app = createApp({embedding: {kind: 'offline', dimension: 16}});
    t.teardown(() => app.close());
    const dir = await mkdtemp(join(tmpdir(), 'semantic-log-sinks-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const file = join(dir, 'sinks.log');
    const service = createServiceWriter({
        url: 'http://service.test',
        fetch: (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
            const response = await app.inject({
                method: 'POST',
                url: new URL(String(input)).pathname,
                headers: init?.headers as Record<string, string>,
                payload: String(init?.body),
            });
            return new Response(null, {status: response.statusCode});
        }) as typeof fetch,
    });
    const fileWriter = {write: (line: string): void => void appendFileSync(file, line)};

    const originalWrite = process.stdout.write;
    const written: string[] = [];
    process.stdout.write = ((chunk: unknown): boolean => {
        written.push(String(chunk));
        return true;
    }) as typeof process.stdout.write;
    try {
        const logger = createLogger({service: 'hub', sinks: [service, fileWriter], now: () => 1757765472345});
        logger.info('three ways');
        logger.info('three ways');
    } finally {
        process.stdout.write = originalWrite;
    }
    await service.flush();

    t.equal(written.length, 2, 'stdout carried both records');
    t.match(written.join(''), /info {2}three ways/, 'the human line reached stdout');
    t.equal(
        await readFile(file, 'utf8'),
        written.join(''),
        'the file destination received byte-for-byte what stdout did, for both records',
    );
    const templates = (await app.inject({method: 'GET', url: '/templates'})).json() as Array<{
        service: string;
        count: number;
    }>;
    t.equal(templates.length, 1, 'the service received one template, both times');
    t.equal(templates[0]?.service, 'hub', 'the service filed it under the emitting service');
    t.equal(templates[0]?.count, 2, 'and counted both records');
});

t.test('a parent link reaches the lineage index through the shipped sink (PRD R7)', async t => {
    // Every other lineage test builds `refs.parent` into its event literal, so
    // they all stayed green while `toEvent` dropped the field — the emitter
    // wrote it, the index read it, and nothing carried it between them. This
    // drives the real seam: two `logger.info` calls, the real service writer,
    // the real ingest route and a real `LineageIndex`. It records the parent key
    // on the wire, the reconstructed chain and its root.
    const lineage = new LineageIndex();
    const app = createApp({embedding: {kind: 'offline', dimension: 16}, lineage});
    t.teardown(() => app.close());
    const service = createServiceWriter({
        url: 'http://service.test',
        fetch: (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
            const response = await app.inject({
                method: 'POST',
                url: new URL(String(input)).pathname,
                headers: init?.headers as Record<string, string>,
                payload: String(init?.body),
            });
            return new Response(null, {status: response.statusCode});
        }) as typeof fetch,
    });
    // The emitter's own records are observed beside the service sink, so the
    // parent link the logger stamped can be compared with the one the index
    // reconstructed — without parsing the rendered line back into a record.
    const captured: LogRecord[] = [];
    const logger = createLogger({
        service: 'hub',
        writer: {
            write: (_line: string, record?: LogRecord): void => {
                if (record) captured.push(record);
            },
        },
        sinks: [service],
    });
    logger.info('first');
    logger.info('second');
    await service.flush();

    const [first, second] = captured;
    t.ok(first && second, 'both records were emitted');
    t.equal(second?.refs.parent, first?.id, 'the second record names the first as its parent');
    const secondId = second?.id ?? '';
    t.equal(lineage.chain(secondId)[0]?.id, first?.id, 'the chain reconstructs root-first from the first');
    t.equal(lineage.rootOf(secondId), first?.id, 'the root of the second record is the first');
});
