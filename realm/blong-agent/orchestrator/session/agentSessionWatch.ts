import type {IAgentTelemetryEvent, IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

import {
    FEED_TAIL,
    feedTokenParse,
    sessionFeedFrame,
    sessionFeedStart,
    type IKafkaOffset,
    type ISessionFeedFrame,
} from './agentSessionFeed.ts';
import {agentSettings, type IAgentDispatchPort} from '../settings.ts';
// The ring is this group's own library: it stands in for the broker when the deployment has none,
// and the choice between the two is made here, one layer above both (`@@D-1013`).
import {
    telemetryRingRead,
    telemetryRingSize,
    telemetryRingWatch,
} from './telemetryRing.ts';

/** What a watch reads: records in the shape `sessionFeedFrame` turns into frames. */
interface IFeedRecord {
    partition: number;
    offset: number;
    value?: string;
}

/** One ring event as the record a frame is built from. */
const recordOf = (event: IAgentTelemetryEvent): IFeedRecord => ({
    partition: 0,
    offset: event.seq,
    value: JSON.stringify(event),
});

/**
 * `agent.session.watch` — a session's tail, and then its live events (`T-793`).
 *
 * The handler is an async iterable, so the gateway streams it (`@@D-949`). Where the records come
 * from is the deployment's choice and never a fallback (`@@D-988`): `telemetry.source: kafka` reads
 * the topic, from `high - tail` on the partition the session's row remembers; `memory` reads the
 * realm's ring, which the same configuration makes the place telemetry is written. Both answer one
 * frame shape, so a page cannot tell which one it is looking at — and a Playwright run, which has no
 * broker, watches a session through the second (`@@D-1008`).
 *
 * A record is one frame, and its `last` token is what a page hands back after a reconnect so it is
 * not shown a section twice. `details: false` sends the cursor and the size and nothing else.
 *
 * It lives here, and not in the `db` group it was first written in, because it decides *where* the
 * records come from — a topic or the ring — and frames them for a reader. That is orchestration: an
 * adapter reads or writes one system, and an adapter reaching into another adapter for the next step
 * would make the realm's control flow a property of its deployments (`@@D-1013`).
 */
export default handler(
    ({
        handler: {
            // `agent.session.get` is answered by the `db` adapter, so the adapter is named; a
            // `kafka.*` method needs no prefix, because its subject already is the adapter's
            // namespace (`@@D-1013`).
            'db/agentSessionGet': agentSessionGet,
            kafkaTopicOffsets,
            kafkaTopicWatch,
        },
    }) => {
    /** The topic: the tail of the session's partition, then live records from the same one. */
    const brokerSource = async (
        params: {sessionId: string; tail?: number},
        $meta: IMeta,
        topic: string,
    ): Promise<{source: AsyncIterable<IFeedRecord>; reachedStart: boolean}> => {
        const found = (await agentSessionGet({sessionId: params.sessionId}, $meta)) as {
            session?: {kafkaPartition?: number | null};
        };
        const offsets = (await kafkaTopicOffsets({topic}, $meta)) as {
            partitions: IKafkaOffset[];
        };
        // The session's own partition when the row remembers one; every partition's tail when it
        // does not, because a key cannot be hashed back to a partition (`@@D-996`).
        const {starts, reachedStart} = sessionFeedStart(offsets.partitions, {
            partition: found.session?.kafkaPartition ?? undefined,
            tail: params.tail,
        });
        const source = (await kafkaTopicWatch(
            {topic, starts, key: params.sessionId},
            {...$meta, stream: true},
        )) as AsyncIterable<IFeedRecord>;
        return {source, reachedStart};
    };

    /**
     * The ring: the same tail, then the same live sequence.
     *
     * A ring event has no partition and no offset of its own, so it is given the shape a record
     * has — partition 0, the event's sequence as its offset. That is what keeps one token
     * grammar (`<partition>:<offset>`) and one `after` contract across both sources.
     */
    const memorySource = (
        params: {sessionId: string; tail?: number; after?: string},
        $meta: IMeta,
    ): {source: AsyncIterable<IFeedRecord>; reachedStart: boolean} => {
        const tail = Math.max(1, Number(params.tail) || FEED_TAIL);
        const size = telemetryRingSize(params.sessionId);
        const after = feedTokenParse(params.after);
        const tailEvents = telemetryRingRead(params.sessionId, {
            tail,
            ...(after && {after: after.offset}),
        });
        const lastSeq = tailEvents[tailEvents.length - 1]?.seq ?? after?.offset;
        const source = (async function* ring() {
            for (const event of tailEvents) yield recordOf(event);
            const live = telemetryRingWatch(params.sessionId, {
                ...(lastSeq === undefined ? {} : {after: lastSeq}),
                ...($meta.abort ? {signal: $meta.abort} : {}),
            });
            for await (const event of live) yield recordOf(event);
        })();
        // The ring's own start is what the flag is about here: a tail that read the whole ring
        // reached it, and one that read the last 500 of 5,000 did not.
        return {source, reachedStart: size <= tail};
    };

    return {
        async agentSessionWatch(
            params: {sessionId: string; tail?: number; details?: boolean; after?: string},
            $meta: IMeta,
        ): Promise<AsyncIterable<ISessionFeedFrame>> {
            const settings = agentSettings((this as unknown as IAgentDispatchPort).config);
            const {source, reachedStart} =
                settings.telemetry.source === 'memory'
                    ? memorySource(params, $meta)
                    : await brokerSource(params, $meta, settings.telemetry.topic);

            return (async function* frames() {
                let announced = false;
                for await (const record of source) {
                    const frame = sessionFeedFrame(record, {
                        details: params.details,
                        after: params.after,
                    });
                    if (!frame) continue;
                    // Only the first frame says where the window began: a reader that keeps
                    // receiving live frames is past the question by then.
                    if (!announced) {
                        announced = true;
                        yield {...frame, reachedStart};
                        continue;
                    }
                    yield frame;
                }
            })();
        },
    };
});
