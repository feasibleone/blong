/**
 * The participant runtime (PRD R7/R9).
 *
 * The runtime is what lets a participant file be nothing but protocol steps and
 * logging, so these tests pin the seams it owns: the fastify app, the identity
 * headers, the per-request flow scope and per-hop stepping. The two identities
 * are tested as **distinct values** deliberately — a trace is causal correlation
 * and may span more than one flow, while the flow id names one execution of a
 * flow, so a test that only ever bound one value could not tell a correct
 * implementation from one that reuses the trace as the flow id.
 */

import {createServer, request as httpRequest} from 'node:http';
import {mkdtemp, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import t from 'tap';

import {currentContext, currentTrace} from '../../src/context.ts';
import {levelValue} from '../../src/level.ts';
import {isUlid} from '../../src/ulid.ts';
import {
    FLOW_HEADER,
    TRACE_HEADER,
    createParticipant,
    hop,
    type Participant,
    type ParticipantOptions,
} from '../../flow/participant.ts';

/** The stable process name the deployment gives every fixture participant. */
const KIND = 'transfer.single';

/** A caller-minted execution identity, so a test can pin the propagated value. */
const FLOW_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
/** A different execution of the same process: the flow id is per execution. */
const OTHER_FLOW_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAW';
/** A trace id, deliberately not a ULID and not equal to any flow id. */
const TRACE_ID = 'tr-fixed';

/** A signature a fastify handler receives, narrowed to what the runtime reads. */
type HeadersOnly = {headers: Record<string, unknown>};

function requestWith(headers: Record<string, unknown>): HeadersOnly {
    return {headers};
}

/**
 * GET a URL with `header` sent **twice**, and return the parsed body.
 *
 * An array-valued `headers` entry makes Node put two header *lines* on the wire,
 * which is what a caller that sets the header twice actually sends. The HTTP
 * parser then joins them into one comma-separated value before the handler sees
 * it — so this is the only faithful way to test what a repeated identity header
 * does, and it is deliberately not `{headers: {name: ['a', 'b']}}`, a shape no
 * request ever produces.
 */
async function getWithRepeatedHeader(
    url: string,
    header: string,
    value: string,
): Promise<{status: number; body: {trace: string; flow: string}}> {
    return await new Promise((resolve, reject) => {
        const request = httpRequest(url, {method: 'GET', headers: {[header]: [value, value]}}, response => {
            const chunks: Buffer[] = [];
            response.on('data', chunk => chunks.push(chunk as Buffer));
            response.on('end', () =>
                resolve({
                    status: response.statusCode ?? 0,
                    body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as {trace: string; flow: string},
                }),
            );
        });
        request.on('error', reject);
        request.end();
    });
}

async function withParticipant(
    name: string,
    fn: (participant: Participant) => Promise<void>,
    extra: Partial<ParticipantOptions> = {},
): Promise<void> {
    const cacheDir = await mkdtemp(join(tmpdir(), `semantic-log-${name}-`));
    const participant = await createParticipant({name, kind: KIND, port: 0, cacheDir, ...extra});
    try {
        await fn(participant);
    } finally {
        await participant.close();
        await rm(cacheDir, {recursive: true, force: true});
    }
}

t.test('a participant listens on an ephemeral port and logs its own service name', async t => {
    await withParticipant('payer', async participant => {
        t.equal(participant.name, 'payer');
        t.equal(participant.logger.service, 'payer', 'the logger carries the service name');
        participant.app.get('/ping', async () => ({pong: true}));
        const address = await participant.listen();
        t.equal(await participant.listen(), address, 'listening again returns the bound address');
        const response = await fetch(`${address}/ping`);
        t.same(await response.json(), {pong: true});
        t.ok(participant.port > 0, 'the real port is known after listen');
    });
});

t.test('a hop carries the trace id to the next participant', async t => {
    await withParticipant('downstream', async downstream => {
        downstream.app.post('/quotes', async request => ({received: request.headers[TRACE_HEADER] ?? null}));
        const address = await downstream.listen();
        await withParticipant('upstream', async upstream => {
            const result = await hop(upstream, address, '/quotes', {amount: 10}, TRACE_ID, FLOW_ID);
            t.equal(result.status, 200);
            t.same(result.body, {received: TRACE_ID});
        });
    });
});

t.test('a participant mints a trace id and a flow ULID when none is supplied', async t => {
    await withParticipant('payer', async participant => {
        participant.app.get('/entry', async request => ({
            trace: participant.traceFrom(request),
            flow: participant.flowFrom(request),
        }));
        const address = await participant.listen();
        const response = await fetch(`${address}/entry`);
        const body = (await response.json()) as {trace: string; flow: string};
        t.match(body.trace, /^tr-\d+$/, 'a trace id is minted when the header is absent');
        t.ok(isUlid(body.flow), 'the entry point mints a ULID for the flow execution');
    });
});

t.test('closing a participant releases the port and the cache', async t => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'semantic-log-close-'));
    const participant = await createParticipant({name: 'payer', kind: KIND, port: 0, cacheDir});
    t.equal(participant.cacheDir, cacheDir, 'the participant reports the directory it retains records in');
    const address = await participant.listen();
    await participant.close();
    await t.rejects(fetch(`${address}/anything`), 'the port is released');
    await rm(cacheDir, {recursive: true, force: true});
});

t.test('a hop carries the trace and the flow execution as separate identities', async t => {
    await withParticipant('downstream', async downstream => {
        downstream.app.post('/identities', async request => ({
            trace: downstream.traceFrom(request),
            flow: downstream.flowFrom(request),
        }));
        const address = await downstream.listen();
        await withParticipant('upstream', async upstream => {
            const result = await hop(upstream, address, '/identities', {}, TRACE_ID, FLOW_ID);
            const body = result.body as {trace: string; flow: string};
            t.equal(body.trace, TRACE_ID, 'the trace is propagated verbatim');
            t.equal(body.flow, FLOW_ID, 'the flow execution id is propagated verbatim, not re-minted');
            t.not(body.flow, body.trace, 'the flow id is not the trace id');

            const next = await hop(upstream, address, '/identities', {}, TRACE_ID, OTHER_FLOW_ID);
            t.equal(
                (next.body as {flow: string}).flow,
                OTHER_FLOW_ID,
                'the same trace can carry a second execution with its own flow id',
            );
        });
    });
});

t.test('run binds the trace, the flow execution and the deployment kind', async t => {
    await withParticipant('payer', async participant => {
        const seen = participant.run(TRACE_ID, FLOW_ID, () => ({
            trace: currentTrace(),
            flow: currentContext().flow,
            intent: currentContext().intent,
        }));
        t.equal(seen.trace, TRACE_ID);
        t.equal(seen.flow?.id, FLOW_ID);
        t.equal(seen.flow?.kind, KIND, 'the kind comes from the deployment, not the request');
        t.equal(seen.intent, undefined, 'no intent unless the participant declares one');
    });
});

t.test('an entry participant runs every request under its declared intent', async t => {
    await withParticipant(
        'payer',
        async participant => {
            const intent = participant.run(TRACE_ID, FLOW_ID, () => currentContext().intent);
            t.same(intent, {name: 'User_Transfer', actor: 'payer', tenant: 'acme'});
        },
        {intent: {name: 'User_Transfer', actor: 'payer', tenant: 'acme'}},
    );
});

t.test('run refuses a malformed flow id and an empty kind', async t => {
    await withParticipant('payer', async participant => {
        t.throws(
            () => participant.run(TRACE_ID, 'flow-1', () => 1),
            /flow id must be a ULID/,
            'a non-ULID execution id is caller misuse',
        );
    });
    await withParticipant(
        'payer',
        async participant => {
            t.throws(
                () => participant.run(TRACE_ID, FLOW_ID, () => 1),
                /flow kind must be a non-empty string/,
                'a flow with no stable name has no drift key',
            );
        },
        {kind: ''},
    );
});

t.test('phase steps the bound flow and refuses to step outside one', async t => {
    await withParticipant('payer', async participant => {
        const status = await participant.run(TRACE_ID, FLOW_ID, async () => {
            await participant.phase('discovery', async () => undefined);
            return currentContext().flow?.status;
        });
        t.equal(status, 'completed', 'the completed step is reflected in the bound flow');
        await t.rejects(participant.phase('discovery', () => 1), /outside a flow/);
    });
});

t.test('only a non-empty string identity header is propagated', async t => {
    await withParticipant('payer', async participant => {
        t.equal(participant.traceFrom(requestWith({[TRACE_HEADER]: 'tr-in'})), 'tr-in');
        t.equal(participant.flowFrom(requestWith({[FLOW_HEADER]: FLOW_ID})), FLOW_ID);
        t.match(
            participant.traceFrom(requestWith({[TRACE_HEADER]: ''})),
            /^tr-\d+$/,
            'a blank trace header is ignored',
        );
        t.ok(
            isUlid(participant.flowFrom(requestWith({[FLOW_HEADER]: ''}))),
            'a blank flow header is ignored',
        );
    });
});

t.test('a header repeated on the wire is not an identity', async t => {
    await withParticipant('payer', async participant => {
        participant.app.get('/entry', async request => {
            const traceId = participant.traceFrom(request);
            const flowId = participant.flowFrom(request);
            // Through `run`, so a carried-but-malformed flow id would throw where a
            // real request would — the difference between a minted ULID and a 500.
            return participant.run(traceId, flowId, () => ({
                trace: currentTrace(),
                flow: currentContext().flow?.id ?? '',
            }));
        });
        const address = await participant.listen();

        const repeatedTrace = await getWithRepeatedHeader(`${address}/entry`, TRACE_HEADER, TRACE_ID);
        t.equal(repeatedTrace.status, 200, 'a request repeating the trace header is served');
        t.match(
            repeatedTrace.body.trace,
            /^tr-\d+$/,
            'and a trace id is minted rather than the joined string being carried into every record',
        );

        const repeatedFlow = await getWithRepeatedHeader(`${address}/entry`, FLOW_HEADER, FLOW_ID);
        t.equal(repeatedFlow.status, 200, 'a request repeating the flow header is served, not answered with a 500');
        t.ok(
            isUlid(repeatedFlow.body.flow),
            'because a ULID is minted instead of the joined string reaching `withFlow` as a malformed id',
        );
    });
});

t.test('a hop whose response has no JSON body reports it as undefined', async t => {
    await withParticipant('downstream', async downstream => {
        downstream.app.post('/plain', async (_request, reply) => reply.type('text/plain').send('accepted'));
        const address = await downstream.listen();
        await withParticipant('upstream', async upstream => {
            const result = await hop(upstream, address, '/plain', {}, TRACE_ID, FLOW_ID);
            t.equal(result.status, 200);
            t.equal(result.body, undefined, 'a non-JSON body is not fabricated');
        });
    });
});

t.test('a participant honours an explicit log level', async t => {
    await withParticipant(
        'payer',
        async participant => {
            t.equal(participant.logger.level(), levelValue('debug'), 'the explicit level is in force');
        },
        {level: 'debug'},
    );
});

t.test('a participant with a service URL ships its records there as a second destination', async t => {
    // A stand-in for the cluster service. What is asserted is only the half the
    // fixture claims: when a service is configured the records reach it, and they are
    // *still* retained locally, so the service is a second destination rather than a
    // replacement. Whether the service then makes sense of them is its own suite's
    // subject.
    const batches: Array<{events?: Array<{msg?: string; service?: string}>}> = [];
    const server = createServer((request, response) => {
        const chunks: Buffer[] = [];
        request.on('data', chunk => chunks.push(chunk as Buffer));
        request.on('end', () => {
            batches.push(JSON.parse(Buffer.concat(chunks).toString('utf8')) as {events?: Array<{msg?: string}>});
            response.writeHead(200, {'content-type': 'application/json'});
            response.end('{"accepted":1}');
        });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const bound = server.address();
    const port = typeof bound === 'object' && bound !== null ? bound.port : 0;

    const cacheDir = await mkdtemp(join(tmpdir(), 'semantic-log-sink-'));
    try {
        const participant = await createParticipant({
            name: 'payer',
            kind: KIND,
            port: 0,
            cacheDir,
            serviceUrl: `http://127.0.0.1:${port}`,
        });
        participant.logger.info('a record worth shipping', {amount: 100});
        // `close` is what has to flush the sink: a sink is drained separately from the
        // write tracker, so a run that only flushed the logger would ship every record
        // but the last — the one a failure run exists to deliver.
        await participant.close();

        const events = batches.flatMap(batch => batch.events ?? []);
        t.equal(events.length, 1, 'the configured service received the record');
        t.equal(events[0]?.msg, 'a record worth shipping', 'and it is the record, not a wrapper around one');
        t.equal(events[0]?.service, 'payer', 'carrying the participant that emitted it');

        const retainedLocally = await readdir(join(cacheDir, 'records')).catch(() => [] as string[]);
        t.equal(retainedLocally.length, 1, 'while the same record is retained locally, so the service is optional');
    } finally {
        await rm(cacheDir, {recursive: true, force: true});
        await new Promise<void>(resolve => server.close(() => resolve()));
    }
});
