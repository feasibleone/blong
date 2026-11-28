// Coverage matrix: test/blong-int-adapter/README.md#kafka-coverage — keep this file in step.
import {handler, type IMeta} from '@feasibleone/blong';
import type Assert from 'node:assert';

type FeedCounts = {
    processed: number;
    failed: number;
    offsets: number[];
    peakInFlight: number;
    lastError?: string;
};
type ReadHandler = (params: object, $meta: IMeta) => unknown;

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * One id for this process's run, so a broker that also holds an earlier run's records can still be
 * read unambiguously — every assertion matches the records this run produced.
 */
const RUN = `run-${Date.now()}`;

/** One record: the call it stands for, and what the run it belongs to is. */
const recordOf = (params: Record<string, unknown>): string =>
    JSON.stringify({method: 'kafka.feed.record.handle', params: {...params, run: RUN}});

/** Wait for a counter the feed's handler keeps to reach what the run expects. */
const poll = async (
    counts: () => Promise<FeedCounts>,
    until: (counts: FeedCounts) => boolean,
    budgetMs = 20_000,
): Promise<FeedCounts> => {
    const deadline = Date.now() + budgetMs;
    let current = await counts();
    while (Date.now() < deadline && !until(current)) {
        await sleep(150);
        current = await counts();
    }
    return current;
};

/**
 * The most recent records of a topic, read the way a viewer reads them.
 *
 * A watching reader assigns its partitions and starts at an offset we just read, so nothing waits
 * for a group to rebalance (`@@D-989`); the tail is what this run appended, because a dead letter
 * and an answer topic both keep what earlier runs put there.
 */
const findRecent = async (
    readOffsets: ReadHandler,
    readWatch: ReadHandler,
    $meta: IMeta,
    topic: string,
    accept: (value: string) => boolean,
): Promise<string | undefined> => {
    const offsets = (await readOffsets({topic}, $meta)) as {
        partitions?: {partition: number; low: number; high: number}[];
    };
    const starts = (offsets.partitions ?? [])
        .filter(partition => partition.high > partition.low)
        .map(partition => ({
            partition: partition.partition,
            offset: Math.max(partition.low, partition.high - 20),
        }));
    if (!starts.length) return undefined;
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 10_000);
    try {
        const stream = (await readWatch(
            {topic, starts},
            {...$meta, stream: true, abort: controller.signal},
        )) as AsyncIterable<{value?: string}>;
        for await (const record of stream) {
            if (typeof record.value === 'string' && accept(record.value)) return record.value;
        }
    } finally {
        clearTimeout(deadline);
        controller.abort();
    }
    return undefined;
};

/**
 * testKafkaFeed — records produced to a feed's topic are dispatched as calls, committed, and — when
 * the handler refuses one — dead-lettered with its own bytes (`@@D-1036`).
 *
 * The run id keeps the assertions honest on a broker that also holds the previous run's records:
 * every record and every dead letter is matched by it.
 */
export default handler(
    ({
        lib: {group},
        handler: {
            kafkaFeedCounterGet,
            kafkaFeedCounterReset,
            kafkaMessageSend,
            kafkaTopicOffsets,
            kafkaTopicWatch,
        },
    }) => {
        const counts = async ($meta: IMeta): Promise<FeedCounts> =>
            (await kafkaFeedCounterGet({}, $meta)) as FeedCounts;
        return {
            testKafkaFeed: ({name = 'kafka feed'}: {name?: string} = {}) =>
                group(name)([
                    async function reset(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                        const result = (await kafkaFeedCounterReset({}, $meta)) as {
                            reset?: boolean;
                        };
                        assert.strictEqual(result.reset, true, 'the counters start empty');
                    },

                    async function produceRecords(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                        for (const params of [{offset: 1}, {offset: 2}, {offset: 3, fail: true}]) {
                            const sent = (await kafkaMessageSend(
                                {topic: 'blong-int-adapter.feed.work', value: recordOf(params)},
                                $meta,
                            )) as {topic?: string; offset?: number};
                            assert.strictEqual(
                                sent.topic,
                                'blong-int-adapter.feed.work',
                                'the send answers the logical topic it was given',
                            );
                            assert.strictEqual(
                                typeof sent.offset,
                                'number',
                                'and the offset the broker put it at',
                            );
                        }
                    },

                    async function waitForTheFeed(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                        const state = await poll(
                            () => counts($meta),
                            current => current.processed >= 2 && current.failed >= 2,
                        );
                        assert.strictEqual(
                            state.processed,
                            2,
                            `both records the handler accepts were dispatched (${JSON.stringify(state)})`,
                        );
                        assert.ok(
                            state.failed >= 2,
                            'the refused record was tried as often as the feed allows',
                        );
                        assert.deepStrictEqual(
                            state.offsets,
                            [1, 2],
                            'in the order they were produced',
                        );
                        return state;
                    },

                    async function readDeadLetter(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                        const dead = await findRecent(
                            kafkaTopicOffsets,
                            kafkaTopicWatch,
                            $meta,
                            'blong-int-adapter.feed.dead',
                            value => value.includes(RUN),
                        );
                        assert.ok(
                            dead,
                            `the record the handler refused is in the dead letter of ${RUN}`,
                        );
                        const parsed = JSON.parse(dead as string) as {
                            method?: string;
                            params?: {offset?: number; fail?: boolean; run?: string};
                        };
                        assert.strictEqual(
                            parsed.method,
                            'kafka.feed.record.handle',
                            'carrying its own bytes, so nothing about the call is lost',
                        );
                        assert.strictEqual(
                            parsed.params?.fail,
                            true,
                            'including what made it fail',
                        );
                        assert.strictEqual(parsed.params?.run, RUN, 'and which run it belongs to');
                        return dead;
                    },

                    async function deadLetterIsNotRetried(
                        assert: typeof Assert,
                        {$meta}: {$meta: IMeta},
                    ) {
                        // A record the feed dead-lettered is committed with it: the broker never
                        // offers it again, so the counters stop moving once it is disposed of.
                        const before = await counts($meta);
                        await sleep(500);
                        const after = await counts($meta);
                        assert.strictEqual(
                            after.failed,
                            before.failed,
                            'the dead-lettered record is not dispatched again',
                        );
                        assert.deepStrictEqual(
                            after.offsets,
                            before.offsets,
                            'and nothing else it read was replayed',
                        );
                        return after;
                    },

                    async function retryThenSucceed(
                        assert: typeof Assert,
                        {$meta}: {$meta: IMeta},
                    ) {
                        // A record that refuses its first attempt and accepts the second: the retry
                        // path end to end, with no dead letter involved.
                        const before = await counts($meta);
                        await kafkaMessageSend(
                            {
                                topic: 'blong-int-adapter.feed.work',
                                value: recordOf({offset: 8, failOnce: true}),
                            },
                            $meta,
                        );
                        const state = await poll(
                            () => counts($meta),
                            current => current.offsets.includes(8),
                        );
                        assert.ok(
                            state.offsets.includes(8),
                            `the record is accepted on its second attempt (${JSON.stringify(state)})`,
                        );
                        assert.ok(
                            state.failed > before.failed,
                            'after failing once, which is what made it a retry',
                        );
                        assert.deepStrictEqual(
                            state.offsets,
                            [...before.offsets, 8],
                            'and it is processed once, not twice',
                        );
                        const dead = await findRecent(
                            kafkaTopicOffsets,
                            kafkaTopicWatch,
                            $meta,
                            'blong-int-adapter.feed.dead',
                            value => value.includes(RUN) && value.includes('"offset":8'),
                        );
                        assert.strictEqual(
                            dead,
                            undefined,
                            'a record that succeeds on its retry is never dead-lettered',
                        );
                        return state;
                    },

                    async function parallelConcurrency(
                        assert: typeof Assert,
                        {$meta}: {$meta: IMeta},
                    ) {
                        const before = await counts($meta);
                        // Six records that each hold the handler for a moment: read one at a time,
                        // they take six times as long as read three at a time.
                        for (let offset = 10; offset < 16; offset++) {
                            await kafkaMessageSend(
                                {
                                    topic: 'blong-int-adapter.feed.parallel',
                                    value: recordOf({offset, holdMs: 120}),
                                },
                                $meta,
                            );
                        }
                        const state = await poll(
                            () => counts($meta),
                            current => current.processed >= before.processed + 6,
                        );
                        assert.strictEqual(
                            state.processed,
                            before.processed + 6,
                            `every record of the parallel feed was processed (${JSON.stringify(state)})`,
                        );
                        assert.ok(
                            state.peakInFlight >= 2,
                            `the feed held ${state.peakInFlight} records inside the handler at once`,
                        );
                        assert.ok(
                            state.peakInFlight <= 3,
                            'and never more than the concurrency it was given',
                        );
                        return state;
                    },

                    async function globIsExpanded(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                        // One feed, one pattern, two topics: a glob cannot be subscribed to, so the
                        // feed expands it against the broker's topics at start and the records of
                        // both arrive (`@@D-1035`).
                        // Markers of their own: every other record this run produced is numbered
                        // below them, so nothing already processed can satisfy the wait.
                        const markers = [21, 22];
                        for (const [index, topic] of [
                            'blong-int-adapter.feed.glob.one',
                            'blong-int-adapter.feed.glob.two',
                        ].entries()) {
                            await kafkaMessageSend(
                                {topic, value: recordOf({offset: markers[index]})},
                                $meta,
                            );
                        }
                        const state = await poll(
                            () => counts($meta),
                            current => markers.every(offset => current.offsets.includes(offset)),
                        );
                        assert.deepStrictEqual(
                            state.offsets.filter(offset => markers.includes(offset)),
                            markers,
                            `both topics behind the pattern were read (${JSON.stringify(state)})`,
                        );
                        return state;
                    },

                    async function answerIsProduced(
                        assert: typeof Assert,
                        {$meta}: {$meta: IMeta},
                    ) {
                        // A record that asks for an answer: the feed encodes it with the instance's
                        // codec and produces it through the producer its topic resolves to — the one
                        // the `blong-int-adapter.feed.answers*` pattern selects (`@@D-1035` `@@D-1036`).
                        await kafkaMessageSend(
                            {
                                topic: 'blong-int-adapter.feed.work',
                                value: recordOf({offset: 7, reply: true}),
                            },
                            $meta,
                        );
                        let answer: string | undefined;
                        const deadline = Date.now() + 15_000;
                        while (Date.now() < deadline && answer === undefined) {
                            answer = await findRecent(
                                kafkaTopicOffsets,
                                kafkaTopicWatch,
                                $meta,
                                'blong-int-adapter.feed.answers',
                                value => value.includes(RUN),
                            );
                            if (answer === undefined) await sleep(200);
                        }
                        assert.ok(
                            answer,
                            `the answer reached blong-int-adapter.feed.answers for ${RUN}`,
                        );
                        const parsed = JSON.parse(answer as string) as {
                            replied?: boolean;
                            run?: string;
                        };
                        assert.strictEqual(
                            parsed.replied,
                            true,
                            'carrying what the handler answered',
                        );
                        assert.strictEqual(parsed.run, RUN, 'and which run it belongs to');
                        return answer;
                    },
                ]),
        };
    },
);
