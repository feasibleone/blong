import type {IAgentTelemetryEvent} from '@feasibleone/blong';
import {library} from '@feasibleone/blong';

/**
 * `agent.session.feed` — where a session's watch starts, and what one frame carries (`T-793`).
 *
 * The arithmetic is here rather than in the handler so it can be asserted without a broker: a tail
 * is `high - tail`, the session's own partition is used when the row remembers one, and every
 * partition's tail is read when it does not — a key cannot be hashed back to a partition, so the
 * fallback is to look at them all (`@@D-996`).
 */
export interface IKafkaOffset {
    partition: number;
    low: number;
    high: number;
}

export interface IFeedStart {
    partition: number;
    offset: number;
}

export interface ISessionFeedStart {
    starts: IFeedStart[];
    /**
     * Whether the window reached the oldest message the topic still holds.
     *
     * False means "there is more before this", which is what a page turns into a "load earlier"
     * button instead of pretending the session began where the tail begins.
     */
    reachedStart: boolean;
}

/** How many partition messages a route reads back before it goes live. */
export const FEED_TAIL = 500;

const nonNegative = (value: unknown, fallback: number): number => {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback;
};

/**
 * Where the watch starts, from the watermarks and (when known) the session's partition.
 *
 * A session whose partition is known reads the tail of that one partition. One whose row predates
 * the column, or whose first batch never reached a broker, has no partition to read: the window is
 * then divided across the partitions, so looking at all of them costs the same as looking at one
 * rather than `tail × partitions`.
 */
export const sessionFeedStart = (
    offsets: IKafkaOffset[],
    options: {partition?: number | null; tail?: number} = {},
): ISessionFeedStart => {
    const tail = Math.max(1, nonNegative(options.tail, FEED_TAIL));
    const known =
        options.partition === undefined || options.partition === null
            ? undefined
            : offsets.find(part => part.partition === options.partition);
    if (known) {
        const offset = Math.max(known.low, known.high - tail);
        return {starts: [{partition: known.partition, offset}], reachedStart: offset <= known.low};
    }
    const perPartition = Math.max(20, Math.ceil(tail / Math.max(1, offsets.length)));
    const starts = offsets.map(part => ({
        partition: part.partition,
        offset: Math.max(part.low, part.high - perPartition),
    }));
    return {
        starts,
        reachedStart: starts.every((start, index) => start.offset <= offsets[index].low),
    };
};

/** A reader's token: `"<partition>:<offset>"`, the position of the last record it rendered. */
export interface IFeedToken {
    partition: number;
    offset: number;
}

export const feedTokenParse = (token: string | undefined): IFeedToken | undefined => {
    if (!token) return undefined;
    const [partition, offset] = token.split(':');
    const parsedPartition = Number(partition);
    const parsedOffset = Number(offset);
    return Number.isInteger(parsedPartition) && Number.isInteger(parsedOffset)
        ? {partition: parsedPartition, offset: parsedOffset}
        : undefined;
};

/** One frame of a session's stream. */
export interface ISessionFeedFrame {
    /** The partition the record came from, and where in it. */
    partition: number;
    offset: number;
    /** Where a reader resumes from: the same two numbers, as one token. */
    last: string;
    /** The events the record carried — absent when the caller asked for the cursor only. */
    events?: IAgentTelemetryEvent[];
    /** Bytes of the record, for the cursor-only mode. */
    size?: number;
    /**
     * On the first frame only: whether the window reached the oldest message the topic still holds.
     *
     * False is what a page turns into "load earlier" instead of pretending the session began where
     * the tail begins.
     */
    reachedStart?: boolean;
}

/**
 * One consumed record as a frame, or `undefined` when the reader has already seen it.
 *
 * `after` is the token the reader handed back: the same partition at or before that offset is a
 * record it rendered before a reconnect, not news, and answering it again is what makes a page
 * duplicate a section it already drew.
 */
export const sessionFeedFrame = (
    record: {partition: number; offset: number; value?: string},
    options: {details?: boolean; after?: string} = {},
): ISessionFeedFrame | undefined => {
    const after = feedTokenParse(options.after);
    if (after && record.partition === after.partition && record.offset <= after.offset)
        return undefined;
    const frame: ISessionFeedFrame = {
        partition: record.partition,
        offset: record.offset,
        last: `${record.partition}:${record.offset}`,
    };
    if (options.details === false) {
        frame.size = (record.value ?? '').length;
        return frame;
    }
    const event = record.value ? (JSON.parse(record.value) as IAgentTelemetryEvent) : undefined;
    frame.events = event ? [event] : [];
    return frame;
};

export default library(() => ({sessionFeedStart, sessionFeedFrame, feedTokenParse}));
