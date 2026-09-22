/**
 * The participant runtime (PRD R7/R9).
 *
 * The runtime is what lets a participant file be nothing but protocol steps and
 * logging, so these tests pin the seams it owns: the fastify app, the identity
 * headers, the per-request flow scope and per-hop stepping. The identities are
 * tested as **distinct values** deliberately — a trace is causal correlation and
 * may span more than one flow, the flow id names one execution of a flow, and a
 * leg names the one call a hop makes — so a test that only ever bound one value
 * could not tell a correct implementation from one that reuses the trace as the
 * flow id.
 *
 * The header names and the propagation rule are the **library's** (PRD R22), so
 * they are imported from `src/propagation.ts`: the fixture consumes that
 * contract, and what these tests pin is a participant using it correctly.
 */

import {mkdtemp, rm} from 'node:fs/promises';
import {createServer, request as httpRequest} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import t from 'tap';

import {
    createParticipant,
    hop,
    type Participant,
    type ParticipantOptions,
} from '../../flow/participant.ts';
import {cacheRecordIds, openCache} from '../../src/cache.ts';
import {
    bindInboundLeg,
    bindLeg,
    currentContext,
    currentLeg,
    currentTrace,
    type LegIdentity,
} from '../../src/context.ts';
import {levelValue} from '../../src/level.ts';
import {readIdentities, TRACE_HEADER} from '../../src/propagation.ts';
import {isUlid} from '../../src/ulid.ts';

/** The stable process name the deployment gives every fixture participant. */
const KIND = 'transfer.single';

/** A caller-minted execution identity, so a test can pin the propagated value. */
const FLOW_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
/** A different execution of the same process: the flow id is per execution. */
const OTHER_FLOW_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAW';
/** A trace id, deliberately not a ULID and not equal to any flow id. */
const TRACE_ID = 'tr-fixed';

/**
 * A declared call (PRD R22): the call site's name and the participant it expects to
 * answer. `hop` refuses a call with no declaration, so a test that wants to exercise
 * one declares it — exactly as a participant file does.
 */
const DECLARATION = {id: 'upstream.quote.request', from: 'payer', to: 'downstream'};

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
        const request = httpRequest(
            url,
            {method: 'GET', headers: {[header]: [value, value]}},
            response => {
                const chunks: Buffer[] = [];
                response.on('data', chunk => chunks.push(chunk as Buffer));
                response.on('end', () =>
                    resolve({
                        status: response.statusCode ?? 0,
                        body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
                            trace: string;
                            flow: string;
                        },
                    }),
                );
            },
        );
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

/**
 * Run `fn` as the caller of one declared call: the trace and execution a request
 * carries, and the declaration a hop inside needs (PRD R22).
 */
function inLeg<T>(participant: Participant, fn: () => T, flowId: string = FLOW_ID): T {
    return participant.run(TRACE_ID, flowId, undefined, () => bindLeg(DECLARATION, fn));
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
        downstream.app.post('/quotes', async request => readIdentities(request.headers));
        const address = await downstream.listen();
        await withParticipant('upstream', async upstream => {
            const result = await inLeg(upstream, () =>
                hop(upstream, address, '/quotes', {amount: 10}),
            );
            t.equal(result.status, 200);
            t.equal(
                (result.body as {trace?: string}).trace,
                TRACE_ID,
                'the trace reaches the next participant',
            );
        });
    });
});

t.test('a hop carries every identity, in one header (PRD R22)', async t => {
    // The leg is the one identity the receiver could not otherwise know: the trace
    // says which request, the flow id says which execution, and only the leg says
    // *which call* — together with the participant the caller expected to answer and
    // the call's position, which is what pairs the two records and orders them.
    await withParticipant('downstream', async downstream => {
        downstream.app.post('/quotes', async request => readIdentities(request.headers));
        const address = await downstream.listen();
        await withParticipant('upstream', async upstream => {
            const result = await inLeg(upstream, () =>
                hop(upstream, address, '/quotes', {amount: 10}),
            );
            t.same(
                result.body,
                {
                    trace: TRACE_ID,
                    flow: FLOW_ID,
                    leg: DECLARATION.id,
                    from: DECLARATION.from,
                    to: 'downstream',
                    seq: '1',
                },
                'every field of the declaration reaches the other end in one header, verbatim',
            );
        });
    });
});

t.test('a hop with no declaration is refused, not recorded as an anonymous call', async t => {
    // A hop that named no call, or named no receiver, would produce a record that no
    // edge can be drawn from, and the loss would be invisible — so it is refused where
    // the mistake is (PRD R22).
    await withParticipant('downstream', async downstream => {
        downstream.app.post('/quotes', async () => ({ok: true}));
        const address = await downstream.listen();
        await withParticipant('upstream', async upstream => {
            await t.rejects(
                upstream.run(TRACE_ID, FLOW_ID, undefined, () =>
                    hop(upstream, address, '/quotes', {}),
                ),
                /must declare the participant it calls/,
                'no leg at all',
            );
            await t.rejects(
                upstream.run(TRACE_ID, FLOW_ID, undefined, () =>
                    bindInboundLeg({id: 'payer.quote.rates', seq: '1'}, () =>
                        hop(upstream, address, '/quotes', {}),
                    ),
                ),
                /must declare the participant it calls/,
                'and an adopted call declares nothing, so the next call must be declared',
            );
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
    t.equal(
        participant.cacheDir,
        cacheDir,
        'the participant reports the directory it retains records in',
    );
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
            const result = await inLeg(upstream, () => hop(upstream, address, '/identities', {}));
            const body = result.body as {trace: string; flow: string};
            t.equal(body.trace, TRACE_ID, 'the trace is propagated verbatim');
            t.equal(
                body.flow,
                FLOW_ID,
                'the flow execution id is propagated verbatim, not re-minted',
            );
            t.not(body.flow, body.trace, 'the flow id is not the trace id');

            const next = await inLeg(
                upstream,
                () => hop(upstream, address, '/identities', {}),
                OTHER_FLOW_ID,
            );
            t.equal(
                (next.body as {flow: string}).flow,
                OTHER_FLOW_ID,
                'the same trace can carry a second execution with its own flow id',
            );
        });
    });
});

t.test(
    'run binds the trace, the flow execution, the inbound leg and the deployment kind',
    async t => {
        await withParticipant('payer', async participant => {
            const seen = participant.run(TRACE_ID, FLOW_ID, undefined, () => ({
                trace: currentTrace(),
                flow: currentContext().flow,
                leg: currentLeg(),
                intent: currentContext().intent,
            }));
            t.equal(seen.trace, TRACE_ID);
            t.equal(seen.flow?.id, FLOW_ID);
            t.equal(seen.flow?.kind, KIND, 'the kind comes from the deployment, not the request');
            t.equal(seen.leg, undefined, 'no leg unless the request carried one');
            t.equal(seen.flow?.leg, undefined, 'and none is invented for it');
            t.equal(seen.intent, undefined, 'no intent unless the participant declares one');

            // The leg an inbound request carried is bound for the whole request, which
            // is what puts the *caller's* id on this participant's receipt. It stays
            // beside the flow in the ambient context and is joined to it only when a
            // record is assembled, because the flow object is shared by reference with
            // every nested scope (a leg must not disturb the position `step` writes).
            const carried = participant.run(
                TRACE_ID,
                FLOW_ID,
                {id: DECLARATION.id, seq: '1'},
                () => ({
                    leg: currentLeg(),
                    flow: currentContext().flow?.id,
                    flowLeg: currentContext().flow?.leg,
                }),
            );
            t.same(
                carried.leg,
                {id: DECLARATION.id, to: undefined, seq: '1'},
                'the inbound call is bound for the whole request',
            );
            t.equal(carried.flow, FLOW_ID, 'beside the flow, which is still bound');
            t.equal(carried.flowLeg, undefined, 'and never written into the shared flow object');
        });
    },
);

t.test('an entry participant runs every request under its declared intent', async t => {
    await withParticipant(
        'payer',
        async participant => {
            const intent = participant.run(
                TRACE_ID,
                FLOW_ID,
                undefined,
                () => currentContext().intent,
            );
            t.same(intent, {name: 'User_Transfer', actor: 'payer', tenant: 'acme'});
        },
        {intent: {name: 'User_Transfer', actor: 'payer', tenant: 'acme'}},
    );
});

t.test('run refuses a malformed flow id and an empty kind', async t => {
    await withParticipant('payer', async participant => {
        t.throws(
            () => participant.run(TRACE_ID, 'flow-1', undefined, () => 1),
            /flow id must be a ULID/,
            'a non-ULID execution id is caller misuse',
        );
    });
    await withParticipant(
        'payer',
        async participant => {
            t.throws(
                () => participant.run(TRACE_ID, FLOW_ID, undefined, () => 1),
                /flow kind must be a non-empty string/,
                'a flow with no stable name has no drift key',
            );
        },
        {kind: ''},
    );
});

t.test('phase steps the bound flow and refuses to step outside one', async t => {
    await withParticipant('payer', async participant => {
        const status = await participant.run(TRACE_ID, FLOW_ID, undefined, async () => {
            await participant.phase('discovery', async () => undefined);
            return currentContext().flow?.status;
        });
        t.equal(status, 'completed', 'the completed step is reflected in the bound flow');
        await t.rejects(
            participant.phase('discovery', () => 1),
            /outside a flow/,
        );
    });
});

t.test("a request's identities are read as the fields they claim to be", async t => {
    await withParticipant('payer', async participant => {
        const packed = `trace=tr-in,flow=${FLOW_ID},leg=${DECLARATION.id},to=downstream,seq=1.2`;
        t.equal(
            participant.traceFrom(requestWith({[TRACE_HEADER]: 'tr-in'})),
            'tr-in',
            'a bare trace id still works',
        );
        t.equal(participant.traceFrom(requestWith({[TRACE_HEADER]: packed})), 'tr-in');
        t.equal(participant.flowFrom(requestWith({[TRACE_HEADER]: packed})), FLOW_ID);
        t.same(participant.legFrom(requestWith({[TRACE_HEADER]: packed})), {
            id: DECLARATION.id,
            to: 'downstream',
            seq: '1.2',
        });
        t.match(
            participant.traceFrom(requestWith({[TRACE_HEADER]: 'trace='})),
            /^tr-\d+$/,
            'a field with no value is not an identity',
        );
        t.ok(
            isUlid(participant.flowFrom(requestWith({[TRACE_HEADER]: 'flow=not-a-ulid'}))),
            'a flow id that is not a ULID is read as absent, so one is minted rather than the request breaking',
        );
    });
});

t.test('an inbound leg a peer malformed is read as no leg, never thrown', async t => {
    // A leg arriving on the wire is another process's value. An unbalanced peer must
    // not be able to break a request by sending one the grammar rejects, so a malformed
    // field is treated exactly as an absent one — the same split the ruling makes for
    // every wire-borne identity (D3, `docs/decisions.md`).
    await withParticipant('payer', async participant => {
        const legFrom = (value: string): LegIdentity | undefined =>
            participant.legFrom(requestWith({[TRACE_HEADER]: value}));
        t.equal(
            legFrom('leg=db/gateway.bundle.find')?.id,
            'db/gateway.bundle.find',
            'a slash: the wire method of a forwarded hop, and lawful',
        );
        t.equal(legFrom('leg=payer discovery'), undefined, 'a space');
        t.equal(legFrom('leg=payer;hop'), undefined, 'a separator that would break a diagram');
        t.same(
            legFrom(`leg=${DECLARATION.id},to=hub bus,seq=x`),
            {id: DECLARATION.id, to: undefined, seq: undefined},
            'a receiver and a position that are not lawful are dropped, and the call still lands',
        );
        t.same(
            legFrom(`leg=${DECLARATION.id}`),
            {id: DECLARATION.id, to: undefined, seq: undefined},
            'a call that declares neither is still a call',
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
            return participant.run(traceId, flowId, undefined, () => ({
                trace: currentTrace(),
                flow: currentContext().flow?.id ?? '',
            }));
        });
        const address = await participant.listen();

        const repeatedTrace = await getWithRepeatedHeader(
            `${address}/entry`,
            TRACE_HEADER,
            `trace=${TRACE_ID}`,
        );
        t.equal(repeatedTrace.status, 200, 'a request repeating the identity header is served');
        t.match(
            repeatedTrace.body.trace,
            /^tr-\d+$/,
            'and a trace id is minted rather than a repeated field being carried into every record',
        );

        const repeatedFlow = await getWithRepeatedHeader(
            `${address}/entry`,
            TRACE_HEADER,
            `flow=${FLOW_ID}`,
        );
        t.equal(
            repeatedFlow.status,
            200,
            'a request repeating it for the flow id is served, not answered with a 500',
        );
        t.ok(
            isUlid(repeatedFlow.body.flow),
            'because a ULID is minted instead of the joined value reaching `withFlow` as a malformed id',
        );
    });
});

t.test('a hop whose response has no JSON body reports it as undefined', async t => {
    await withParticipant('downstream', async downstream => {
        downstream.app.post('/plain', async (_request, reply) =>
            reply.type('text/plain').send('accepted'),
        );
        const address = await downstream.listen();
        await withParticipant('upstream', async upstream => {
            const result = await inLeg(upstream, () => hop(upstream, address, '/plain', {}));
            t.equal(result.status, 200);
            t.equal(result.body, undefined, 'a non-JSON body is not fabricated');
        });
    });
});

t.test('a call that reaches the wrong participant is recorded as such (PRD R22)', async t => {
    // The declaration is what makes this detectable: the participant compares the name
    // it was given with its own and says so, and it *answers anyway* — the peer that
    // reached the wrong service is still owed a reply, and a wire value must not turn
    // into a 500 (D3). `warn` rather than `error` on purpose: an error record escalates
    // withheld detail (R10), and this logger is shared by every request.
    const cacheDir = await mkdtemp(join(tmpdir(), 'semantic-log-misroute-'));
    const participant = await createParticipant({name: 'hub', kind: KIND, port: 0, cacheDir});
    try {
        participant.run(
            TRACE_ID,
            FLOW_ID,
            {id: 'payer.quote.rates', to: 'payee', seq: '1'},
            () => undefined,
        );
        await participant.logger.flush();
        const cache = await openCache({
            dir: cacheDir,
            limit: Number.MAX_SAFE_INTEGER,
            readOnly: true,
        });
        const records: Array<{msg?: string}> = [];
        for (const id of await cacheRecordIds(cacheDir)) {
            const record = await cache.get(id);
            if (record) {
                records.push(record);
            }
        }
        await cache.close();
        const mismatch = records.find(
            (record: {msg?: string}) => record.msg === 'leg declared for another participant',
        ) as {levelName?: string; fields?: Record<string, unknown>} | undefined;
        t.ok(mismatch, 'the misroute is a record, not a silent surprise');
        t.equal(
            mismatch?.levelName,
            'warn',
            "and it is a warning, so it cannot escalate another call's detail",
        );
        t.equal(mismatch?.fields?.declared, 'payee', 'the name the caller expected is on it');
        t.equal(mismatch?.fields?.service, 'hub', 'and so is the participant that answered');
    } finally {
        await participant.close();
        await rm(cacheDir, {recursive: true, force: true});
    }
});

t.test('a participant honours an explicit log level', async t => {
    await withParticipant(
        'payer',
        async participant => {
            t.equal(
                participant.logger.level(),
                levelValue('debug'),
                'the explicit level is in force',
            );
        },
        {level: 'debug'},
    );
});

t.test(
    'a participant with a service URL ships its records there as a second destination',
    async t => {
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
                batches.push(
                    JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
                        events?: Array<{msg?: string}>;
                    },
                );
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
            t.equal(
                events[0]?.msg,
                'a record worth shipping',
                'and it is the record, not a wrapper around one',
            );
            t.equal(events[0]?.service, 'payer', 'carrying the participant that emitted it');

            const retainedLocally = await cacheRecordIds(cacheDir);
            t.equal(
                retainedLocally.length,
                1,
                'while the same record is retained locally, so the service is optional',
            );
        } finally {
            await rm(cacheDir, {recursive: true, force: true});
            await new Promise<void>(resolve => server.close(() => resolve()));
        }
    },
);
