import {randomUUID} from 'node:crypto';

import type {IAssert, IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

/**
 * The two routes a session page reads (`T-792` `T-793`).
 *
 * `agent.session.find` joins the projection, so a list draws without replaying a topic. The watch is
 * an async iterable: it replays the tail from the watermarks, keeps yielding while it is open, and
 * honours both the cursor-only mode and the token a reconnecting reader hands back.
 *
 * The watch half needs a broker; it says so and passes when the cluster does not answer, the way the
 * integration package's backend groups do — a machine without Kafka still runs the realm's suites.
 */
interface IWatchFrame {
    partition: number;
    offset: number;
    last: string;
    events?: Array<{seq: number; kind: string}>;
    size?: number;
    reachedStart?: boolean;
}

/** Records the tail asks for: more than this run publishes, so the window is the topic's business. */
const TAIL = 50;

const within = async <T>(
    iterator: AsyncIterator<T>,
    what: string,
    ms = 5_000,
): Promise<IteratorResult<T>> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            iterator.next(),
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error(`no ${what} within ${ms}ms`)), ms);
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
};

export default handler(context => {
    const {group} = context.lib;
    const {
        agentSessionAdd,
        agentSessionEdit,
        agentSessionFind,
        agentSessionMetricEdit,
        agentSessionWatch,
        kafkaMessageSend,
        kafkaTopicCreate,
        kafkaTopicOffsets,
    } = context.handler;
    const $meta = {} as IMeta;
    const topic = 'blong.agent.telemetry';
    // A worker of this run's own: the database keeps every session a test ever wrote, and a fixed
    // name would list an earlier run's rows beside this one's.
    const workerId = `feed-${randomUUID().slice(0, 8)}`;

    const addSession = async (title: string, worker = workerId): Promise<string> => {
        const sessionId = randomUUID();
        await agentSessionAdd(
            {
                sessionId,
                ticketId: `T-${sessionId.slice(0, 8)}`,
                ticketTitle: title,
                status: 'done',
                engineAdapter: 'engine',
                engineAccount: 'feed',
                engineMode: 'native',
                workerId: worker,
                // The column is not nullable in a table the sync only ever widens, so a session with
                // no workspace says so with an empty path rather than a null the insert refuses.
                workspacePath: '',
            },
            $meta,
        );
        return sessionId;
    };

    /** One telemetry event, as the adapter publishes it: keyed by the session. */
    const publish = async (sessionId: string, seq: number): Promise<number | undefined> => {
        const answer = (await kafkaMessageSend(
            {
                topic,
                key: sessionId,
                value: JSON.stringify({
                    sessionId,
                    seq,
                    kind: 'message',
                    payload: {text: `event ${seq}`},
                    at: Date.now(),
                }),
            },
            $meta,
        )) as {partition?: number} | undefined;
        return answer?.partition;
    };

    return {
        testAgentFeed: ({name = 'agent session feed'}: {name?: string}) =>
            group(name)([
                // 1. The list joins the projection and pages by `updatedAt`.
                async function listWithMetrics(assert: IAssert) {
                    const titles = ['feed-oldest', 'feed-middle', 'feed-newest'];
                    const created: string[] = [];
                    for (const title of titles) {
                        created.push(await addSession(title));
                        // `updatedAt` is a whole-second column, so the order the list promises is
                        // only observable across a second's boundary.
                        await new Promise(resolve => setTimeout(resolve, 1_100));
                    }
                    await agentSessionMetricEdit(
                        {
                            sessionId: created[2],
                            metric: {
                                turnCount: 4,
                                messageTokens: 1200,
                                toolCount: 2,
                                tools: {bash: {count: 2, durationMs: 300}},
                                lastEventAt: Date.now(),
                            },
                        },
                        $meta,
                    );

                    const first = (await agentSessionFind({workerId, limit: 2}, $meta)) as {
                        sessions: Array<Record<string, unknown>>;
                        next?: string;
                    };
                    assert.equal(first.sessions.length, 2, 'a page holds what it was asked for');
                    assert.equal(
                        first.sessions[0].ticketTitle,
                        titles[2],
                        'and starts with the newest',
                    );
                    const metric = first.sessions[0].metric as {messageTokens?: number};
                    assert.equal(metric.messageTokens, 1200, 'the row carries its summary');
                    assert.ok(first.next, 'a full page says where the next one begins');

                    const second = (await agentSessionFind(
                        {workerId, before: first.next, limit: 2},
                        $meta,
                    )) as {sessions: Array<Record<string, unknown>>; next?: string};
                    assert.equal(
                        second.sessions[0].ticketTitle,
                        titles[0],
                        'and the next page carries on from there',
                    );
                    assert.ok(!second.next, 'the last page says so');

                    // Two sessions written inside one second: a cursor that carries only the
                    // timestamp would stop the second page at the boundary between them and lose
                    // one of the two (`@@D-1007`).
                    const tie = `feed-${randomUUID().slice(0, 8)}-tie`;
                    const tied = [await addSession('tie-a', tie), await addSession('tie-b', tie)];
                    const seen: string[] = [];
                    let cursor: string | undefined;
                    for (let page = 0; page < 3; page++) {
                        const found = (await agentSessionFind(
                            {workerId: tie, limit: 1, ...(cursor && {before: cursor})},
                            $meta,
                        )) as {sessions: Array<Record<string, unknown>>; next?: string};
                        seen.push(...found.sessions.map(row => String(row.sessionId)));
                        cursor = found.next;
                        if (!cursor) break;
                    }
                    assert.deepEqual(
                        [...seen].sort(),
                        [...tied].sort(),
                        'both rows of one second are reachable through the cursor',
                    );
                    return created;
                },

                // 2. The watch replays the tail, then keeps yielding, then honours a token.
                async function watchTail(
                    assert: IAssert,
                    {listWithMetrics: created}: {listWithMetrics: Promise<string[]>},
                ) {
                    const sessions = await created;
                    const subject = sessions[0];
                    let partition: number | undefined;
                    try {
                        await kafkaTopicCreate({topic}, $meta);
                        for (let seq = 0; seq < 5; seq++) {
                            const landed = await publish(subject, seq);
                            partition ??= landed;
                        }
                    } catch (error) {
                        assert.ok(
                            true,
                            `the broker does not answer, so the watch was not exercised: ${
                                error instanceof Error ? error.message : String(error)
                            }`,
                        );
                        return;
                    }
                    assert.ok(Number.isInteger(partition), 'the first event names its partition');
                    await agentSessionEdit(
                        {sessionId: subject, patch: {kafkaPartition: partition}},
                        $meta,
                    );

                    const offsets = (await kafkaTopicOffsets({topic}, $meta)) as {
                        partitions: Array<{partition: number; low: number; high: number}>;
                    };
                    assert.ok(offsets.partitions.length > 0, 'the topic reports its partitions');

                    // The window starts at `high - tail` and never before the topic's own start, so
                    // whether the tail reached the start is a fact about the partition - a topic
                    // this test shares with every other run on the machine - and the frame has to
                    // report it, not the test assume it.
                    const watermark = offsets.partitions.find(
                        candidate => candidate.partition === partition,
                    )!;
                    const start = Math.max(watermark.low, watermark.high - TAIL);

                    const controller = new AbortController();
                    const stream = (await agentSessionWatch(
                        {sessionId: subject, tail: TAIL},
                        {
                            ...$meta,
                            stream: true,
                            abort: controller.signal,
                        },
                    )) as AsyncIterable<IWatchFrame>;
                    const iterator = stream[Symbol.asyncIterator]();

                    const tail: IWatchFrame[] = [];
                    for (let index = 0; index < 5; index++) {
                        const frame = await within(iterator, 'tail frame');
                        assert.ok(!frame.done, `tail frame ${index} arrives`);
                        tail.push(frame.value);
                    }
                    assert.deepEqual(
                        tail.map(frame => frame.events?.[0].seq),
                        [0, 1, 2, 3, 4],
                        'the tail carries the subject’s events, in order',
                    );
                    assert.equal(
                        tail[0].reachedStart,
                        start <= watermark.low,
                        'and says whether the window reached the topic’s own start',
                    );
                    assert.equal(
                        tail[0].last,
                        `${tail[0].partition}:${tail[0].offset}`,
                        'a frame names where a reader resumes from',
                    );

                    // A record produced while the reader is open is news, not tail.
                    await publish(subject, 5);
                    const live = await within(iterator, 'a live frame');
                    assert.ok(!live.done, 'a live record arrives while the reader is open');
                    assert.equal(
                        live.value.events?.[0].seq,
                        5,
                        'and it is the event just produced',
                    );
                    controller.abort();

                    // The cursor-only mode is what a log viewer asks for.
                    const cursorOnly = new AbortController();
                    const cursorStream = (await agentSessionWatch(
                        {sessionId: subject, tail: TAIL, details: false},
                        {...$meta, stream: true, abort: cursorOnly.signal},
                    )) as AsyncIterable<IWatchFrame>;
                    const cursorIterator = cursorStream[Symbol.asyncIterator]();
                    const cursor = await within(cursorIterator, 'a cursor frame');
                    assert.ok(!cursor.done, 'a cursor frame arrives');
                    assert.ok(!cursor.value.events, 'and carries no events');
                    assert.ok((cursor.value.size ?? 0) > 0, 'but says how big the record is');
                    cursorOnly.abort();

                    // A reader that hands back its token is not shown the record again.
                    const resumed = new AbortController();
                    const resumedStream = (await agentSessionWatch(
                        {sessionId: subject, tail: TAIL, after: tail[1].last},
                        {...$meta, stream: true, abort: resumed.signal},
                    )) as AsyncIterable<IWatchFrame>;
                    const resumedIterator = resumedStream[Symbol.asyncIterator]();
                    const after = await within(resumedIterator, 'a frame after the token');
                    assert.ok(!after.done, 'the watch resumes');
                    assert.equal(
                        after.value.events?.[0].seq,
                        2,
                        'after the record the reader already rendered',
                    );
                    resumed.abort();
                },
            ]),
    };
});
