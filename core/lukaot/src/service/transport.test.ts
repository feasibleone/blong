/**
 * The service sink: a `Writer` that forwards records, and never costs the caller anything.
 *
 * The properties pinned here are the ones that make it safe to install beside a local writer:
 * nothing touches the socket on the caller's stack, every failure is counted rather than thrown,
 * the queue is bounded, and a record that names no signal is refused instead of being counted
 * against nothing.
 */

import t from 'tap';
import type {LogRecord} from '../record.ts';
import type {IngestEvent} from './ledger.ts';
import {createServiceWriter, toEvent, type IServiceRecord} from './transport.ts';

function record(overrides: Partial<IServiceRecord> = {}): IServiceRecord {
    return {
        id: 'r1',
        time: 1000,
        level: 30,
        levelName: 'warn',
        msg: 'ticket t-1 was not claimed',
        service: 'agent',
        refs: {record: 'r1', trace: 'tr-1'},
        signal: 'agentTicketSkipped',
        ...overrides,
    };
}

/** A `fetch` stand-in that records what it was asked to send and answers what it is told to. */
function fetcher(answer: () => Promise<Response> | Response) {
    const sent: Array<{url: string; events: IngestEvent[]}> = [];
    const call = (async (url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as {events: IngestEvent[]};
        sent.push({url: String(url), events: body.events});
        return answer();
    }) as unknown as typeof fetch;
    return {call, sent};
}

const ok = () => new Response('', {status: 202});

void t.test('an event names the record it came from, and the signal it reached', t => {
    const event = toEvent(record());
    t.equal(event.id, 'r1');
    t.equal(event.signal, 'agentTicketSkipped');
    t.equal(event.service, 'agent');
    t.equal(event.message, 'ticket t-1 was not claimed', 'the rendered message travels');
    t.equal(event.levelName, 'warn');
    t.same(event.refs, {record: 'r1', trace: 'tr-1'});
    t.end();
});

void t.test('the envelope reaches the wire: the parent, the flow and the progress names', t => {
    const event = toEvent(
        record({
            refs: {record: 'r1', trace: 'tr-1', parent: 'r0'},
            flow: {id: 'f1', kind: 'transfer.single', leg: 'leg-1', index: 2},
            progress: {
                regions: [{id: 'x', discriminator: 'route', chosen: 'hubB', candidates: ['hubB']}],
                points: [{name: 'prepared', data: {secret: true}}],
            },
            intent: {name: 'ticket.pool'},
            operation: 'agentWorkerTick',
        }),
    );

    t.equal(event.refs?.parent, 'r0', 'the causal chain survives the wire');
    t.equal(event.flow?.id, 'f1');
    t.equal(event.operation, 'agentWorkerTick');
    t.equal(event.intent?.name, 'ticket.pool');
    t.same(event.progress?.points, ['prepared'], 'names only: the checkpoint data stays local');
    t.equal(event.progress?.regions?.[0]?.chosen, 'hubB', 'and a mark travels whole');
    t.end();
});

void t.test('a record is posted as one batch, with the envelope the route reads', async t => {
    const {call, sent} = fetcher(ok);
    const writer = createServiceWriter({url: 'http://svc:9455/', fetch: call});
    writer.write('line', record());
    await writer.flush();

    t.equal(sent.length, 1);
    t.equal(sent[0]?.url, 'http://svc:9455/events', 'the trailing slash is not doubled');
    t.equal(sent[0]?.events[0]?.signal, 'agentTicketSkipped');
    t.equal(writer.failed(), 0);
    t.end();
});

void t.test('write never touches the socket on the caller stack', async t => {
    const {call, sent} = fetcher(ok);
    const writer = createServiceWriter({url: 'http://svc', fetch: call});
    writer.write('line', record());
    t.equal(sent.length, 0, 'nothing was sent before the microtask ran');
    await writer.flush();
    t.equal(sent.length, 1, 'and everything is sent by the time flush resolves');
    t.end();
});

void t.test('a record that names no signal is refused, not sent', async t => {
    const {call, sent} = fetcher(ok);
    const writer = createServiceWriter({url: 'http://svc', fetch: call});
    writer.write('line', record({signal: ''}));
    writer.write('line', {...record(), signal: undefined} as unknown as IServiceRecord);
    writer.write('line', undefined as unknown as LogRecord);
    await writer.flush();

    t.equal(sent.length, 0, 'a record with no identity cannot be counted against anything');
    t.end();
});

void t.test('a refused answer is counted, reported and absorbed', async t => {
    const {call} = fetcher(() => new Response('', {status: 500}));
    const errors: unknown[] = [];
    const writer = createServiceWriter({
        url: 'http://svc',
        fetch: call,
        onError: error => errors.push(error),
    });
    writer.write('line', record());
    await writer.flush();

    t.equal(writer.failed(), 1, 'the loss is counted');
    t.equal(errors.length, 1, 'and reported rather than swallowed');
    t.match(errors[0], /answered 500/);
    t.end();
});

void t.test('a rejected fetch is absorbed too, and flush still resolves', async t => {
    const {call} = fetcher(() => Promise.reject(new Error('connect ECONNREFUSED')));
    const writer = createServiceWriter({url: 'http://svc', fetch: call});
    writer.write('line', record());
    await writer.flush();

    t.equal(writer.failed(), 1);
    t.end();
});

void t.test('a reporter that throws does not break the chain it reports on', async t => {
    const {call, sent} = fetcher(ok);
    const writer = createServiceWriter({
        url: 'http://svc',
        fetch: call,
        onError: () => {
            throw new Error('the reporter is broken');
        },
    });
    writer.write('line', record({id: 'first'}));
    writer.write('line', record({id: 'second'}));
    await writer.flush();
    t.equal(sent.length, 2, 'both records were still attempted');
    t.end();
});

void t.test('the queue is bounded, and a drop is not a delivery failure', async t => {
    let release: () => void = () => undefined;
    const held = new Promise<void>(resolve => {
        release = resolve;
    });
    const {call, sent} = fetcher(async () => {
        await held;
        return ok();
    });
    const writer = createServiceWriter({url: 'http://svc', fetch: call, sendLimit: 1});
    writer.write('line', record({id: 'in-flight'}));
    // Let the drain start, so the first record is held by the socket rather than by the queue —
    // the bound counts what is still *queued*, exactly as the emitter's own write queue does.
    await Promise.resolve();
    writer.write('line', record({id: 'queued'}));
    writer.write('line', record({id: 'dropped'}));

    t.equal(writer.dropped(), 1, 'the oldest queued send was discarded');
    t.equal(writer.failed(), 0, 'and a drop is a policy decision, not a failure');
    release();
    await writer.flush();
    t.equal(sent.length, 2, 'the in-flight and the retained one were sent');
    t.same(
        sent.map(batch => batch.events[0]?.id),
        ['in-flight', 'dropped'],
        'and what was dropped was the oldest still queued, not the newest',
    );
    t.end();
});

void t.test('a send limit below one is rejected rather than silently changed', t => {
    for (const sendLimit of [0, -1, Number.NaN]) {
        t.throws(() => createServiceWriter({url: 'http://svc', sendLimit}), RangeError);
    }
    t.end();
});
