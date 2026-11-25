import {handler, type IMeta} from '@feasibleone/blong';
import {perfReport, perfSample, perfStats, perfWrite} from '@feasibleone/blong-lib/perf';
import type Assert from 'node:assert';
import {join} from 'node:path';

type Shape = {created: boolean; partitions: number; matches: boolean};
type Offsets = {topic: string; partitions: {partition: number; low: number; high: number}[]};
type WatchRecord = {partition: number; offset: number; key?: string; value?: string};

/**
 * The topic the measurement writes to (`T-802`).
 *
 * `<topicPrefix>.<namespace>.<feed>`, because the adapter refuses a name outside its own namespace
 * and the instance these operations reach is attached as `telemetry` (`D-990`). Retention is short
 * on purpose: the CI cluster is disposable and a dev cluster should not accumulate a perf run's
 * messages.
 */
const performanceTopic = {
    topic: 'blong.telemetry.perf',
    partitions: 12,
    /** Ten minutes, so a second run does not read the first one's history. */
    retentionMs: 10 * 60 * 1000,
    cleanupPolicy: 'delete',
} as const;

/**
 * What an acceptable broker does with this load, on a developer machine or a CI runner (`T-804`).
 *
 * These are the numbers `kafka-perf.md` beside this package publishes: a threshold a test
 * carries alone is a threshold somebody loosens without writing down why (`D-995`).
 */
const thresholds = {
    /** Messages per second across the send path, measured over busy time rather than the silences. */
    minThroughput: 150,
    /** Milliseconds from `message.send` returning to the record arriving at the watch. */
    maxP95LatencyMs: 400,
    maxP99LatencyMs: 800,
    /**
     * The spike check: the first record a reader sees after the feed went quiet.
     *
     * A cold path costs what the warm one does plus whatever the broker, the consumer's fetch and
     * the page's first render had let go idle, so this sits far above the warm p95 on purpose — a
     * number that fails here is a stall, not a slow sample.
     */
    maxFirstAfterSilenceMs: 250,
    /** Milliseconds a single produce waits for its acknowledgement when nothing else is running. */
    maxAckP95Ms: 60,
    /** Milliseconds from opening a watch on a full backlog to having read the last record. */
    maxDrainSpanMs: 2_000,
    /** A send slower than this is reported as an outlier; the count is the run's spike signal. */
    outlierMs: 100,
    /** The measurement gives up rather than hang when records go missing. */
    deadlineMs: 60_000,
} as const;

/** The shape of one telemetry message: a session key and a small JSON delta. */
const messageShape = {
    /** Sessions interleaved on the same partitions, so the watch's key filter does real work. */
    sessions: 6,
    /** Bytes of filler in each payload, inside the 200–400 range a delta occupies. */
    paddingBytes: 240,
} as const;

/**
 * Bursts of traffic with silence between them.
 *
 * A live session is not a steady stream: a turn produces a burst of deltas and then the session
 * waits for a person or for the model. What that pattern can expose and a continuous stream hides is
 * the cost of the *first* message after the silence — a consumer that stopped fetching, a broker
 * that let a connection go idle, a page that paused its rendering.
 */
const bursts = {
    count: 5,
    /** Messages per session in one burst. */
    perBurst: 20,
    /** How long nothing is sent between two bursts. */
    silenceMs: 1_500,
} as const;

/** One producer run, then one consumer run — never both at once. */
const isolated = {
    messages: 300,
    /** How long the consumer may take to drain the backlog before the run gives up. */
    deadlineMs: 30_000,
} as const;

/** Where the Allure runner reads results: the package the test runs in. */
const resultsDir = join(process.cwd(), 'allure-results-tap');

const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

const payloadOf = (record: WatchRecord): {sentAt?: number} => {
    try {
        return JSON.parse(record.value ?? '{}') as {sentAt?: number};
    } catch {
        return {};
    }
};

/**
 * The Kafka measurement the session UI rests on (`T-802` `T-803` `T-804`, `D-995`,
 * `@@D-1016`).
 *
 * What a page needs is not "does Kafka work" — the produce and round-trip groups already say that —
 * but whether a broker on this machine answers fast enough for a live session, and whether the first
 * thing it shows after a quiet spell is as quick as the rest. Three populations are recorded, because
 * they are what a reader feels: the acknowledgement a produce waits for, the warm latency of a record
 * inside a burst, and the latency of the first record after the feed went silent. Each run leaves a
 * report with the distribution and a chart, attached to Allure when the runner writes there.
 */
export default handler(
    ({
        lib: {group},
        handler: {
            telemetryMessageSend,
            telemetryTopicCreate,
            telemetryTopicOffsets,
            telemetryTopicWatch,
        },
    }) => {
        /** The topic at the shape the measurement needs; idempotent, so a second run is free. */
        const createTopic = async (assert: typeof Assert, {$meta}: {$meta: IMeta}) => {
            const shape = (await telemetryTopicCreate(
                {
                    topic: performanceTopic.topic,
                    partitions: performanceTopic.partitions,
                    retentionMs: performanceTopic.retentionMs,
                    cleanupPolicy: performanceTopic.cleanupPolicy,
                },
                $meta,
            )) as Shape;
            assert.strictEqual(
                shape.partitions,
                performanceTopic.partitions,
                'the topic has the partitions the measurement needs',
            );
            return shape;
        };

        /**
         * Where every partition stands before this run writes.
         *
         * Read first, so a second run does not read the first one's history: retention bounds the
         * topic, it does not reset it.
         */
        const startsOf = async ($meta: IMeta) => {
            const before = (await telemetryTopicOffsets(
                {topic: performanceTopic.topic},
                $meta,
            )) as Offsets;
            return before.partitions.map(part => ({
                partition: part.partition,
                offset: part.high,
            }));
        };

        return {
            testKafkaPerf: ({name = 'kafka telemetry burst latency'}: {name?: string}) =>
                group(name)([
                    createTopic,

                    async function burstsOfTraffic(
                        assert: typeof Assert,
                        {$meta, createTopic: created}: {$meta: IMeta; createTopic: Promise<Shape>},
                    ) {
                        await created;
                        const starts = await startsOf($meta);
                        const expected = bursts.count * bursts.perBurst;

                        // Four populations rather than one: what a warm produce waited for, what the
                        // first produce after a silence waited for, what a record inside a burst cost,
                        // and what the first one after the silence cost.
                        const ack = perfSample('send acknowledgement', 'ms');
                        const coldSend = perfSample('first send after silence', 'ms');
                        const warm = perfSample('warm record', 'ms');
                        const cold = perfSample('first after silence', 'ms');

                        const controller = new AbortController();
                        const deadline = setTimeout(
                            () => controller.abort(),
                            thresholds.deadlineMs,
                        );
                        let lastReceiptAt = 0;
                        let seen = 0;
                        const watched = (async () => {
                            // The call is async — it answers with the sequence — so the iterable
                            // comes out of the promise the port answers with.
                            const stream = (await telemetryTopicWatch(
                                {topic: performanceTopic.topic, starts, key: 'session-0'},
                                {...$meta, stream: true, abort: controller.signal},
                            )) as AsyncIterable<WatchRecord>;
                            for await (const record of stream) {
                                const now = Date.now();
                                const payload = payloadOf(record);
                                const latency = payload.sentAt ? now - payload.sentAt : 0;
                                // The reader's own silence, not the writer's: what a page waits
                                // through is the gap between two frames it received.
                                if (lastReceiptAt && now - lastReceiptAt >= bursts.silenceMs * 0.8)
                                    cold.add(latency);
                                else warm.add(latency);
                                lastReceiptAt = now;
                                seen++;
                            }
                        })();

                        const padding = 'x'.repeat(messageShape.paddingBytes);
                        const sentPerBurst = bursts.perBurst * messageShape.sessions;
                        // The slowest send of the run, named: a spike a reader can act on is one
                        // that says which burst and which position in it paid it.
                        const slowest = {ms: 0, burst: 0, index: 0, session: 0};
                        let busyMs = 0;
                        for (let burst = 0; burst < bursts.count; burst++) {
                            if (burst > 0) await wait(bursts.silenceMs);
                            const burstStartedAt = Date.now();
                            for (let index = 0; index < bursts.perBurst; index++) {
                                for (let session = 0; session < messageShape.sessions; session++) {
                                    const sentAt = Date.now();
                                    await telemetryMessageSend(
                                        {
                                            topic: performanceTopic.topic,
                                            key: `session-${session}`,
                                            value: JSON.stringify({
                                                burst,
                                                index,
                                                session,
                                                kind: 'message',
                                                text: padding,
                                                sentAt,
                                            }),
                                        },
                                        $meta,
                                    );
                                    const ackMs = Date.now() - sentAt;
                                    if (ackMs > slowest.ms) {
                                        slowest.ms = ackMs;
                                        slowest.burst = burst;
                                        slowest.index = index;
                                        slowest.session = session;
                                    }
                                    // The first produce of a burst is the one that meets whatever
                                    // the idle period left behind: a socket the broker dropped, a
                                    // connection the client let go, a batch window that closed. It
                                    // is recorded apart from the warm ones so the spike is a number
                                    // rather than a tail somebody argues about.
                                    if (index === 0 && session === 0) coldSend.add(ackMs);
                                    else ack.add(ackMs);
                                }
                            }
                            busyMs += Date.now() - burstStartedAt;
                        }
                        // The reader is closed after the last send, not when its count is reached:
                        // disconnecting a consumer blocks this process for over a second, and a
                        // teardown inside the window was what the slowest send of the run was
                        // measuring (`T-808`).
                        const closeStartedAt = Date.now();
                        controller.abort();
                        await watched;
                        const closeMs = Date.now() - closeStartedAt;
                        clearTimeout(deadline);

                        // Throughput over the time actually spent sending: the silences are the
                        // pattern being measured, not a cost of the broker.
                        const sent = bursts.count * sentPerBurst;
                        const throughput = sent / (busyMs / 1000);
                        const warmStats = perfStats(warm.values);
                        const coldStats = perfStats(cold.values);
                        const outliers = [...ack.values, ...coldSend.values].filter(
                            value => value > thresholds.outlierMs,
                        ).length;

                        const report = perfReport({
                            title: 'kafka telemetry — bursts interleaved with silence',
                            environment: {
                                broker: 'localhost:9092',
                                topic: performanceTopic.topic,
                                partitions: performanceTopic.partitions,
                                messages: sent,
                                bursts: bursts.count,
                                silenceMs: bursts.silenceMs,
                                'slowest send': `${slowest.ms} ms (burst ${slowest.burst}, position ${slowest.index}, session ${slowest.session})`,
                            },
                            notes: [
                                `${bursts.count} bursts of ${sentPerBurst} messages, ${bursts.silenceMs} ms of silence between them`,
                                `${messageShape.sessions} sessions interleaved, the watch filtered to one key`,
                                'latency is measured from the send returning to the record arriving at the watch',
                                'first after silence is the first record the reader received after at least 80% of the silence had passed',
                            ],
                            samples: [ack, coldSend, warm, cold],
                            measures: [
                                {label: 'send (busy time)', value: throughput, unit: 'msg/s'},
                                {label: 'read back', value: seen, unit: 'records'},
                                {label: 'warm p95', value: warmStats.p95, unit: 'ms'},
                                {label: 'watch close', value: closeMs, unit: 'ms'},
                                {
                                    label: `sends over ${thresholds.outlierMs} ms`,
                                    value: outliers,
                                    unit: 'sends',
                                },
                                {
                                    label: 'first send after silence (max)',
                                    value: perfStats(coldSend.values).max,
                                    unit: 'ms',
                                },
                                {
                                    label: 'first after silence (max)',
                                    value: coldStats.max,
                                    unit: 'ms',
                                },
                            ],
                        });
                        const written = await perfWrite({
                            report,
                            name: 'kafka-burst-latency',
                            resultsDir,
                        });
                        console.log(report.text);

                        assert.strictEqual(
                            seen,
                            expected,
                            `the watch read session-0 back (${seen}/${expected})`,
                        );
                        assert.ok(
                            cold.values.length >= bursts.count - 1,
                            'the silences were long enough for the reader to see them',
                        );
                        assert.ok(
                            throughput >= thresholds.minThroughput,
                            `throughput ${throughput.toFixed(0)} msg/s is at least ${thresholds.minThroughput}`,
                        );
                        assert.ok(
                            warmStats.p95 <= thresholds.maxP95LatencyMs,
                            `warm p95 ${warmStats.p95}ms is within ${thresholds.maxP95LatencyMs}ms`,
                        );
                        assert.ok(
                            warmStats.p99 <= thresholds.maxP99LatencyMs,
                            `warm p99 ${warmStats.p99}ms is within ${thresholds.maxP99LatencyMs}ms`,
                        );
                        assert.ok(
                            coldStats.max <= thresholds.maxFirstAfterSilenceMs,
                            `the first record after a silence took ${coldStats.max}ms, within ${thresholds.maxFirstAfterSilenceMs}ms`,
                        );
                        assert.ok(
                            perfStats(coldSend.values).max <= thresholds.maxFirstAfterSilenceMs,
                            `the first send after a silence took ${perfStats(coldSend.values).max}ms, within ${thresholds.maxFirstAfterSilenceMs}ms`,
                        );
                        assert.ok(written.result, 'the distribution and the chart were attached');
                        return {throughput, warm: warmStats, cold: coldStats};
                    },
                ]),

            testKafkaPerfIsolated: ({name = 'kafka telemetry isolated'}: {name?: string}) =>
                group(name)([
                    createTopic,

                    async function produceThenConsume(
                        assert: typeof Assert,
                        {$meta, createTopic: created}: {$meta: IMeta; createTopic: Promise<Shape>},
                    ) {
                        await created;
                        const starts = await startsOf($meta);
                        const ack = perfSample('produce acknowledgement', 'ms');

                        // Produce first, with nothing consuming: every send waits for its
                        // acknowledgement, so this is the write path alone.
                        const produceStartedAt = Date.now();
                        for (let index = 0; index < isolated.messages; index++) {
                            const sentAt = Date.now();
                            await telemetryMessageSend(
                                {
                                    topic: performanceTopic.topic,
                                    key: 'session-0',
                                    value: JSON.stringify({index, kind: 'message', sentAt}),
                                },
                                $meta,
                            );
                            ack.add(Date.now() - sentAt);
                        }
                        const produceMs = Date.now() - produceStartedAt;

                        // Then consume, from the watermarks read before the run — the phases never
                        // overlap, which is what makes the drain a measure of the read path.
                        const controller = new AbortController();
                        const deadline = setTimeout(() => controller.abort(), isolated.deadlineMs);
                        const first = perfSample('first record after the pause', 'ms');
                        const drain = perfSample('record interval', 'ms');
                        const open = perfSample('watch open', 'ms');
                        let seen = 0;
                        let lastReceiptAt = 0;
                        const openStartedAt = Date.now();
                        const stream = (await telemetryTopicWatch(
                            {topic: performanceTopic.topic, starts, key: 'session-0'},
                            {...$meta, stream: true, abort: controller.signal},
                        )) as AsyncIterable<WatchRecord>;
                        for await (const record of stream) {
                            const now = Date.now();
                            const payload = payloadOf(record);
                            if (seen === 0) {
                                // Opening a watch costs a connection and an assignment before the
                                // first record can arrive; the drain starts when it does.
                                open.add(now - openStartedAt);
                                first.add(now - (payload.sentAt ?? now));
                            } else if (lastReceiptAt) {
                                drain.add(now - lastReceiptAt);
                            }
                            lastReceiptAt = now;
                            seen++;
                            if (seen >= isolated.messages) break;
                        }
                        clearTimeout(deadline);
                        // From opening the watch to the last record: what a reader waiting for a
                        // backlog waits through, which is the number a page lives by.
                        const drainSpanMs = Math.max(1, lastReceiptAt - openStartedAt);
                        const produceThroughput = isolated.messages / (produceMs / 1000);
                        const ackStats = perfStats(ack.values);

                        const report = perfReport({
                            title: 'kafka telemetry — produce, then consume',
                            environment: {
                                broker: 'localhost:9092',
                                topic: performanceTopic.topic,
                                partitions: performanceTopic.partitions,
                                messages: isolated.messages,
                            },
                            notes: [
                                `${isolated.messages} messages produced, each waiting for its acknowledgement, with no consumer running`,
                                'then a watch opened from the watermarks read before the run, once the produce had finished',
                                'first record after the pause is the backlog age a reader opening the session would see',
                                'record interval is the gap between two consecutive records while draining',
                            ],
                            samples: [ack, open, first, drain],
                            measures: [
                                {label: 'produce', value: produceThroughput, unit: 'msg/s'},
                                {label: 'ack p95', value: ackStats.p95, unit: 'ms'},
                                {label: 'read back', value: seen, unit: 'records'},
                                {label: 'watch open', value: open.values[0] ?? 0, unit: 'ms'},
                                {
                                    label: 'backlog at first record',
                                    value: first.values[0] ?? 0,
                                    unit: 'ms',
                                },
                                {label: 'drain span', value: drainSpanMs, unit: 'ms'},
                            ],
                        });
                        const written = await perfWrite({
                            report,
                            name: 'kafka-isolated-produce-consume',
                            resultsDir,
                        });
                        console.log(report.text);

                        assert.strictEqual(
                            seen,
                            isolated.messages,
                            `the drain read every message back (${seen}/${isolated.messages})`,
                        );
                        assert.ok(
                            produceThroughput >= thresholds.minThroughput,
                            `produce ${produceThroughput.toFixed(0)} msg/s is at least ${thresholds.minThroughput}`,
                        );
                        assert.ok(
                            ackStats.p95 <= thresholds.maxAckP95Ms,
                            `ack p95 ${ackStats.p95}ms is within ${thresholds.maxAckP95Ms}ms`,
                        );
                        assert.ok(
                            drainSpanMs <= thresholds.maxDrainSpanMs,
                            `a reader had the whole backlog after ${drainSpanMs}ms, within ${thresholds.maxDrainSpanMs}ms`,
                        );
                        assert.ok(written.result, 'the distribution and the chart were attached');
                        return {produceThroughput, drainSpanMs, ack: ackStats};
                    },
                ]),
        };
    },
);
