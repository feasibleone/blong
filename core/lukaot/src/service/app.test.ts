/**
 * The HTTP surface.
 *
 * Every route the service publishes is exercised here, and so is the one it deliberately does not:
 * `/incidents` answers 404 because the correlation that served it went with the detectors. The tests
 * are `inject`-based, so no socket is opened and the answer is the route's own.
 */

import {mkdtemp, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import t from 'tap';
import {createApp} from './app.ts';
import type {IngestEvent} from './ledger.ts';
import {startService} from './start.ts';

function event(overrides: Partial<IngestEvent> = {}): IngestEvent {
    return {
        id: overrides.id ?? 'r1',
        time: overrides.time ?? 1000,
        signal: overrides.signal ?? 'agentTicketSkipped',
        message: overrides.message ?? 'ticket {ticketId} was not claimed',
        service: overrides.service ?? 'agent',
        ...overrides,
    };
}

async function post(app: ReturnType<typeof createApp>, events: unknown) {
    return app.inject({method: 'POST', url: '/events', payload: {events} as object});
}

void t.test('health is answered without touching anything', async t => {
    const app = createApp();
    const response = await app.inject({method: 'GET', url: '/health'});
    t.equal(response.statusCode, 200);
    t.same(response.json(), {status: 'ok'});
    await app.close();
    t.end();
});

void t.test('an accepted batch is acknowledged, and a malformed one is a 400', async t => {
    const app = createApp();
    const accepted = await post(app, [event({id: 'r1'}), event({id: 'r2', time: 2000})]);
    t.equal(
        accepted.statusCode,
        202,
        'the emitter is not made to wait for a failure it cannot fix',
    );
    t.same(accepted.json(), {accepted: true, signals: 1});

    const rejected = await post(app, [{id: 'r1', time: 1, service: 'agent'}]);
    t.equal(rejected.statusCode, 400, 'a batch with no identifier is the caller\u2019s mistake');
    t.match(rejected.json<{error: string}>().error, /ingest: expected/);
    await app.close();
    t.end();
});

void t.test('the signals are listed and one is read whole', async t => {
    const app = createApp();
    await post(app, [event({id: 'r1'})]);

    const list = await app.inject({method: 'GET', url: '/templates'});
    t.equal(list.json<Array<{ref: string}>>().length, 1);

    const one = await app.inject({method: 'GET', url: '/templates/agentTicketSkipped'});
    t.equal(one.statusCode, 200);
    t.equal(one.json<{ref: string; count: number}>().count, 1, 'no facet is the raw entry');

    const facet = await app.inject({
        method: 'GET',
        url: '/templates/agentTicketSkipped?facet=ops',
    });
    t.equal(facet.json<{count: number}>().count, 1, 'a facet projects it');

    const unknownFacet = await app.inject({
        method: 'GET',
        url: '/templates/agentTicketSkipped?facet=all',
    });
    t.equal(unknownFacet.statusCode, 400, 'an unknown facet is refused, never silently ignored');
    t.same(unknownFacet.json<{facets: string[]}>().facets, ['ops', 'diagnostic', 'compliance']);

    const missing = await app.inject({method: 'GET', url: '/templates/nothing'});
    t.equal(missing.statusCode, 404);
    await app.close();
    t.end();
});

void t.test('a signal is retired once, and the retirement is a delta', async t => {
    const app = createApp();
    await post(app, [event({id: 'r1'})]);

    const first = await app.inject({
        method: 'POST',
        url: '/templates/agentTicketSkipped/retire',
    });
    t.equal(first.statusCode, 200);
    t.ok(first.json<{retiredAt?: number}>().retiredAt, 'the entry was stamped');

    const digest = await app.inject({method: 'GET', url: '/digest'});
    const kinds = digest.json<{entries: Array<{kind: string}>}>().entries.map(entry => entry.kind);
    t.same(kinds, ['signal-added', 'exemplar-retained', 'signal-retired']);

    await app.inject({method: 'POST', url: '/templates/agentTicketSkipped/retire'});
    const again = await app.inject({method: 'GET', url: '/digest'});
    t.equal(
        again.json<{entries: unknown[]}>().entries.length,
        3,
        're-retiring is not a change, so it publishes nothing',
    );

    const missing = await app.inject({method: 'POST', url: '/templates/nothing/retire'});
    t.equal(missing.statusCode, 404);
    await app.close();
    t.end();
});

void t.test('a retained record is read back, and an unknown one is not', async t => {
    const app = createApp();
    await post(app, [event({id: 'r1'})]);
    const found = await app.inject({method: 'GET', url: '/records/r1'});
    t.equal(found.statusCode, 200);
    t.equal(found.json<{signal: string}>().signal, 'agentTicketSkipped');

    const missing = await app.inject({method: 'GET', url: '/records/r9'});
    t.equal(missing.statusCode, 404);
    await app.close();
    t.end();
});

void t.test('the flows are read per kind and per execution, with their diagrams', async t => {
    const app = createApp();
    await post(app, [
        event({
            id: 'r1',
            flow: {id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', kind: 'transfer.single', leg: 'leg-1'},
            progress: {
                regions: [{id: 'x', discriminator: 'route', chosen: 'hubB', candidates: ['hubB']}],
                points: ['prepared'],
            },
        }),
    ]);

    const flows = await app.inject({method: 'GET', url: '/flows'});
    const body = flows.json<{unions: unknown[]; executions: unknown[]}>();
    t.equal(body.unions.length, 1, 'the kind union was observed');
    t.equal(body.executions.length, 1, 'and the execution retained');

    const union = await app.inject({method: 'GET', url: '/flows/transfer.single/diagram'});
    t.equal(union.statusCode, 200);
    t.equal(union.json<{kind: string}>().kind, 'transfer.single');
    t.match(union.json<{diagram: string}>().diagram, /sequenceDiagram/, 'drawn as a sequence');

    const execution = await app.inject({
        method: 'GET',
        url: '/flows/01ARZ3NDEKTSV4RRFFQ69G5FAV/diagram',
    });
    t.equal(execution.statusCode, 200);
    t.same(
        execution.json<{observed: {branches: string[]; points: string[]}}>().observed.branches,
        ['route'],
        'the branch that ran is carried, by name',
    );
    t.same(
        execution.json<{observed: {points: string[]}}>().observed.points,
        ['prepared'],
        'and so are the milestones',
    );

    const unknownKind = await app.inject({method: 'GET', url: '/flows/nope.nope/diagram'});
    t.equal(unknownKind.statusCode, 404, 'an unknown kind says so, and lists the kinds it knows');

    const unknownExecution = await app.inject({
        method: 'GET',
        url: '/flows/01ARZ3NDEKTSV4RRFFQ69G5FAX/diagram',
    });
    t.equal(unknownExecution.statusCode, 404);
    t.match(
        unknownExecution.json<{error: string}>().error,
        /not retained/,
        'and a missing execution is told apart from a missing kind',
    );
    await app.close();
    t.end();
});

void t.test('search ranks signals and records in one list', async t => {
    const app = createApp();
    await post(app, [event({id: 'r1', message: 'ticket t-1 was not claimed'})]);

    t.same(
        (await app.inject({method: 'GET', url: '/search'})).json(),
        [],
        'no query is an empty result, not an error',
    );
    t.same((await app.inject({method: 'GET', url: '/search?q=purpose'})).json(), []);

    const found = (await app.inject({method: 'GET', url: '/search?q=ticket'})).json<
        Array<{kind: string; ref?: string; record?: string}>
    >();
    t.ok(
        found.some(hit => hit.kind === 'signal' && hit.ref === 'agentTicketSkipped'),
        'the declared signal is ranked',
    );
    t.ok(
        found.some(hit => hit.kind === 'record' && hit.record === 'r1'),
        'and so is the occurrence, in the same list',
    );

    const capped = (await app.inject({method: 'GET', url: '/search?q=ticket&limit=abc'})).json<
        unknown[]
    >();
    t.equal(capped.length, 2, 'a malformed limit falls back rather than reading as "no matches"');
    await app.close();
    t.end();
});

void t.test('the deploy diff answers what a window changed', async t => {
    const app = createApp();
    await post(app, [event({id: 'r1', time: 1000})]);
    const diff = await app.inject({method: 'GET', url: '/diff?from=900&to=1100'});
    const body = diff.json<{range: {from: number; to: number}; added: unknown[]}>();
    t.same(body.range, {from: 900, to: 1100}, 'the effective window is echoed back');
    t.equal(body.added.length, 1);
    await app.close();
    t.end();
});

void t.test('the digest pages from a cursor and reports its bound', async t => {
    const app = createApp();
    await post(app, [event({id: 'r1'})]);
    const page = await app.inject({method: 'GET', url: '/digest'});
    const body = page.json<{
        cursor: number;
        stats: {retained: number; oldest: number; dropped: number};
        entries: Array<{seq: number}>;
    }>();
    t.equal(body.cursor, 2, 'a new signal and its exemplar');
    t.same(body.stats, {dropped: 0, retained: 2, oldest: 1});
    t.same(
        body.entries.map(entry => entry.seq),
        [1, 2],
    );

    const after = await app.inject({method: 'GET', url: '/digest?since=1'});
    t.same(
        after.json<{entries: Array<{seq: number}>}>().entries.map(entry => entry.seq),
        [2],
    );
    await app.close();
    t.end();
});

void t.test('there is no incident surface', async t => {
    const app = createApp();
    const response = await app.inject({method: 'GET', url: '/incidents'});
    t.equal(response.statusCode, 404, 'correlation went with the detectors');
    await app.close();
    t.end();
});

void t.test('a snapshot is written as the batch is acknowledged', async t => {
    const directory = await mkdtemp(join(tmpdir(), 'lukaot-app-'));
    const path = join(directory, 'snapshot.json');
    const app = createApp({persistTo: path});
    await post(app, [event({id: 'r1'})]);
    await app.close();

    const restarted = createApp({persistTo: path});
    await restarted.ready();
    const list = await restarted.inject({method: 'GET', url: '/templates'});
    t.equal(list.json<unknown[]>().length, 1, 'the signal survived the restart');
    await restarted.close();
    t.end();
});

void t.test('an unusable snapshot is moved aside, and the service still starts', async t => {
    const directory = await mkdtemp(join(tmpdir(), 'lukaot-app-'));
    const path = join(directory, 'snapshot.json');
    await writeFile(path, 'this is not json');
    const app = createApp({persistTo: path});
    await app.ready();

    const list = await app.inject({method: 'GET', url: '/templates'});
    t.same(list.json(), [], 'it started empty rather than refusing to serve');
    await app.close();

    const {readdir} = await import('node:fs/promises');
    t.same(await readdir(directory), ['snapshot.json.corrupt'], 'and kept the evidence aside');
    t.end();
});

void t.test('the service is started on a port the operating system picks', async t => {
    const running = await startService({port: 0});
    t.ok(running, 'it started');
    t.match(running?.url, /^http:\/\/127\.0\.0\.1:\d+$/, 'and the URL carries the bound port');
    const answer = await running?.app.inject({method: 'GET', url: '/health'});
    t.equal(answer?.statusCode, 200);
    await running?.stop();
    t.end();
});

void t.test('a port that cannot be bound is reported, not thrown', async t => {
    const first = await startService({port: 0});
    const port = Number(new URL(first?.url ?? 'http://127.0.0.1:0').port);
    const errors: unknown[] = [];
    const second = await startService({port, onError: error => errors.push(error)});

    t.equal(second, undefined, 'the second service did not start');
    t.equal(errors.length, 1, 'and the reason was reported');
    await first?.stop();
    t.end();
});
