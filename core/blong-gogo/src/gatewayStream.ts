/**
 * The frame writer behind a streamed route (`@@D-948` `@@D-949`).
 *
 * A stream is a *sequence* where an ordinary call is one value: a realm handler
 * answers an async iterable, and each value it yields leaves as one frame. Nothing
 * here knows what a frame means — the handler's values are the payload, and the
 * writer's job is only to put them on the wire in a way a reader can follow. That
 * is deliberate: the same writer serves a log tail, a progress feed, a file and
 * anything else a realm wants to send over time.
 *
 * Four obligations, each of which somebody has to be able to read on its own:
 *
 * - **Backpressure.** The sink says when it is full and the loop waits for
 *   `drain` rather than queueing in memory, so a slow reader slows the producer
 *   instead of growing the process. A producer that cannot be slowed has to cope
 *   with a gap itself — one more reason the resume cursor is the *route's*
 *   concept and not this file's.
 * - **Heartbeat.** A frame that carries no value, written as soon as the stream opens and again while
 *   nothing else is being written, keeps an idle proxy or ingress from closing a connection the reader
 *   still wants and lets the reader tell a quiet stream from a dead one. In the text envelope it is an
 *   SSE comment, which a client reading `data:` never sees; in the binary one it is a keepalive frame
 *   @@D-955.
 * - **Abort.** The reader going away is an ordinary event: the signal is aborted
 *   so the producer can stop, and the loop stops pulling.
 * - **Ending.** A thrown producer is one `error` frame — the frames before it stay
 *   readable — and then the response closes, so a reader never waits for a frame
 *   that will not come.
 *
 * Two envelopes carry the same frames, and the caller picks one with `Accept`:
 * server-sent events, which a person can read and `curl` can print, and a binary
 * envelope, which costs no base64 and no escape handling. Sealing is the route's
 * decision rather than the caller's (`@@D-949`), because a caller that could ask
 * for the readable envelope would turn a confidential stream into a readable one.
 */

import {
    STREAM_BINARY_TYPE,
    STREAM_FLAG_BATCH,
    STREAM_FLAG_BINARY,
    STREAM_FLAG_KEEPALIVE,
    STREAM_FLAG_SEALED,
    STREAM_MAX_FRAME_BYTES,
    STREAM_TEXT_TYPE,
    encodeFrame,
    sealFrame,
    toBase64,
} from '@feasibleone/blong-mle';

export {STREAM_BINARY_TYPE, STREAM_TEXT_TYPE};

/** A frame whose payload was sealed. */
export const FLAG_SEALED = STREAM_FLAG_SEALED;

/** A frame whose payload is bytes rather than JSON. */
export const FLAG_BINARY = STREAM_FLAG_BINARY;

/** A frame that carries several values, as a JSON array. */
export const FLAG_BATCH = STREAM_FLAG_BATCH;

/** A frame that carries no value, written so a reader can tell quiet from dead @@D-955. */
export const FLAG_KEEPALIVE = STREAM_FLAG_KEEPALIVE;

/** The payload a keepalive carries: none at all. */
const NO_PAYLOAD = new Uint8Array(0);

/**
 * The most one frame may occupy, and why a writer checks it at all.
 *
 * The length field is what a reader trusts, so a frame above the cap is one no
 * reader will accept: better the producer's route hears it here — as one `error`
 * frame and an end — than that the reader drops the stream after refusing a
 * prefix (`@@D-950`).
 */
export const MAX_FRAME_BYTES = STREAM_MAX_FRAME_BYTES;

/** The default idle interval: below the usual proxy timeout, above a poll. */
export const DEFAULT_HEARTBEAT_MS = 15000;

/** The two envelopes a stream can be written in. */
export type StreamEnvelope = 'text' | 'binary';

/** The smallest writable this needs: everything above that is the caller's. */
export interface IFrameSink {
    /** Write one frame; `false` means the sink is full until `drained` resolves. */
    write(frame: string | Uint8Array): boolean;
    /** Resolve when the sink has room again, or when the reader has gone. */
    drained(signal: AbortSignal): Promise<void>;
    /** Finish the response. */
    end(): void;
}

/**
 * The envelope a caller asked for, from its `Accept` header.
 *
 * Stream types are opt-in on purpose: an ordinary call arrives with `*​/*` (curl's
 * default, and a browser's for a request it did not describe), so a stream that
 * answered `*​/*` would answer every call with events. A caller names the envelope
 * it wants, and the text one wins when it names both, because that is the one a
 * person can read.
 */
export function envelopeOf(accept: string | undefined): StreamEnvelope | undefined {
    if (!accept) return undefined;
    // The first envelope the caller named wins, because that is the order it
    // expressed. A browser sends a list; a tool sends the one type it wants.
    for (const type of accept.split(',').map(entry => entry.split(';')[0].trim().toLowerCase())) {
        if (type === STREAM_TEXT_TYPE) return 'text';
        if (type === STREAM_BINARY_TYPE) return 'binary';
    }
    return undefined;
}

/**
 * Values a producer asks to send together.
 *
 * A brand rather than a bare array, because `@@D-949` fixes the rule the other way: a handler that
 * yields an array sends **one** value. Only a value of this type carries the batch flag, so a route
 * whose payload happens to be a list is never flattened into its elements by a reader.
 */
export class StreamBatch {
    readonly values: unknown[];
    constructor(values: unknown[]) {
        this.values = values;
    }
}

/** What one value becomes: its bytes, whether those bytes are JSON, and whether it is a batch. */
export function payloadOf(value: unknown): {bytes: Uint8Array; binary: boolean; batch: boolean} {
    if (value instanceof StreamBatch)
        return {
            bytes: new TextEncoder().encode(JSON.stringify(value.values)),
            binary: false,
            batch: true,
        };
    if (value instanceof Uint8Array) return {bytes: value, binary: true, batch: false};
    const json = typeof value === 'string' ? value : JSON.stringify(value ?? null);
    return {bytes: new TextEncoder().encode(json), binary: false, batch: false};
}

/** One value as one `data:` frame, escaped so a newline cannot end it early. */
export function dataFrame(value: unknown): string {
    const {bytes} = payloadOf(value);
    const text = new TextDecoder().decode(bytes);
    return `${text
        .split('\n')
        .map(line => `data: ${line}`)
        .join('\n')}\n\n`;
}

/** The payload a failed producer ends with. */
export function errorPayload(error: unknown): unknown {
    const typed = error as {message?: string; type?: string; statusCode?: number};
    return {
        error: {
            message: typed?.message ?? String(error),
            ...(typed?.type === undefined ? {} : {type: typed.type}),
            ...(typed?.statusCode === undefined ? {} : {statusCode: typed.statusCode}),
        },
    };
}

/**
 * How one value becomes one frame.
 *
 * The writer asks an encoder rather than knowing a format, which is what lets one
 * transport serve every route: what a frame *means* is the route's, and whether it
 * is sealed is a decision the gateway makes once per stream.
 */
export interface IFrameEncoder {
    /**
     * The frames one value becomes: one, or several when a batch has to be flattened.
     *
     * The binary envelope carries a batch in one flagged frame, but the text envelope has no flags —
     * its reader parses one `data:` block into one value — so a batch sent readably is written as one
     * frame per value, which is what `@@D-949` says the readable envelope does.
     */
    encode(value: unknown, seq: number): Promise<string | Uint8Array | (string | Uint8Array)[]>;
    /** The last frame, written after a producer failed. */
    error(error: unknown, seq: number): Promise<string | Uint8Array>;
    /**
     * A frame that says the stream is still there, carrying no value.
     *
     * The text envelope spells it as an SSE comment and the binary one as a frame flagged keepalive,
     * which every reader skips. It is not sealed even when the route seals: an empty frame has nothing
     * to protect, and spending a sequence number on it would only make the reader do crypto to learn
     * that nothing happened @@D-955.
     */
    keepalive(): string | Uint8Array;
}

/**
 * A frame that is sent as it is.
 *
 * Used by a route that opted out of sealing — because its frames carry something
 * that is not secret, a cursor or a status — and by the text envelope a reader
 * inspects by hand.
 */
export function plainEncoder(envelope: StreamEnvelope): IFrameEncoder {
    return {
        // An unsealed frame needs no sequence: nothing about it is a nonce.
        encode: async (value: unknown) => {
            const {bytes, binary, batch} = payloadOf(value);
            if (envelope === 'text')
                return batch
                    ? (value as StreamBatch).values.map(one => dataFrame(one))
                    : dataFrame(value);
            return binaryFrame((batch ? FLAG_BATCH : 0) | (binary ? FLAG_BINARY : 0), bytes);
        },
        error: async (error: unknown) => {
            if (envelope === 'text') return dataFrame(errorPayload(error));
            return binaryFrame(0, payloadOf(errorPayload(error)).bytes);
        },
        keepalive: () =>
            envelope === 'text' ? ': ping\n\n' : binaryFrame(FLAG_KEEPALIVE, NO_PAYLOAD),
    };
}

/**
 * A frame sealed under the stream's own key (`@@D-949`).
 *
 * The key belongs to one stream, so the sequence number is the whole nonce and no
 * frame needs a random IV. `info` binds a frame to the route it was asked for, so a
 * frame captured from one method does not open under another.
 */
export function sealedEncoder(
    envelope: StreamEnvelope,
    key: CryptoKey,
    info: string,
): IFrameEncoder {
    const seal = async (value: unknown, seq: number): Promise<{sealed: Uint8Array}> => ({
        sealed: await sealFrame(key, seq, payloadOf(value).bytes, info),
    });
    return {
        encode: async (value: unknown, seq: number) => {
            const {batch} = payloadOf(value);
            if (envelope === 'binary') {
                const {sealed} = await seal(value, seq);
                return binaryFrame(batch ? FLAG_SEALED | FLAG_BATCH : FLAG_SEALED, sealed);
            }
            // A batch is one value per readable event, and a sealed one spends a sequence on each, so
            // the writer advances `seq` by the number of frames it is handed.
            const values = batch ? (value as StreamBatch).values : [value];
            const frames: string[] = [];
            for (const [index, one] of values.entries()) {
                const {sealed} = await seal(one, seq + index);
                frames.push(`data: ${toBase64(sealed)}\n\n`);
            }
            return frames;
        },
        error: async (error: unknown, seq: number) => {
            const {sealed} = await seal(errorPayload(error), seq);
            if (envelope === 'binary') return binaryFrame(FLAG_SEALED, sealed);
            return `data: ${toBase64(sealed)}\n\n`;
        },
        // Unsealed on purpose, and carrying nothing: see the interface @@D-955.
        keepalive: () =>
            envelope === 'text' ? ': ping\n\n' : binaryFrame(FLAG_KEEPALIVE, NO_PAYLOAD),
    };
}

/**
 * A binary frame: its length, then the flag byte, then the payload.
 *
 * The length is what makes the envelope self-delimiting — a reader that receives a
 * chunk of any size can find the frames in it, which the newline does for the text
 * envelope.
 */
export function binaryFrame(flags: number, payload: Uint8Array): Uint8Array {
    return encodeFrame(flags, payload);
}

export interface IEventStreamOptions {
    sink: IFrameSink;
    /** The values to send, in order. Each becomes one frame. */
    iterate: AsyncIterable<unknown>;
    /** Aborts when the reader closes the connection. */
    signal: AbortSignal;
    /** How a value becomes a frame. */
    encoder: IFrameEncoder;
    /** How often an idle stream says it is alive, and how long after it opens it first says so. */
    heartbeatMs?: number;
    /** Whether the stream says it is alive at all. */
    heartbeat?: boolean;
    /** The most one frame may occupy. A producer above it ends the stream. */
    maxFrameBytes?: number;
}

/** One frame, or the several a batch becomes on the readable envelope. */
export function framesOf(
    frame: string | Uint8Array | (string | Uint8Array)[],
): (string | Uint8Array)[] {
    if (typeof frame === 'string' || frame instanceof Uint8Array) return [frame];
    return frame;
}

/**
 * Write the iterable as a stream, and resolve once the response ends.
 *
 * Resolves rather than throws: the caller is a route handler that has already
 * taken over the response, so a producer's failure has nowhere to go but a frame —
 * and one frame is what a reader can still report.
 */
export async function writeEventStream({
    sink,
    iterate,
    signal,
    encoder,
    heartbeatMs = DEFAULT_HEARTBEAT_MS,
    heartbeat = true,
    maxFrameBytes = MAX_FRAME_BYTES,
}: IEventStreamOptions): Promise<void> {
    let idle: ReturnType<typeof setInterval> | undefined;
    let wroteSomething = false;
    const write = async (frame: string | Uint8Array): Promise<void> => {
        wroteSomething = true;
        if (sink.write(frame)) return;
        await sink.drained(signal);
    };
    // A keepalive is not a value, so it does not count as writing something: the next idle tick still
    // owes the reader one @@D-955.
    const keepalive = async (): Promise<void> => {
        if (signal.aborted) return;
        if (sink.write(encoder.keepalive())) return;
        await sink.drained(signal);
    };
    if (heartbeat && heartbeatMs > 0) {
        // The first one leaves at once, with the headers. A reader that has just subscribed learns that
        // the stream is open without waiting for the producer's first value — and an intermediary that
        // holds a response back until its first byte now has one, so the headers reach the reader in
        // this request rather than at the first record or never @@D-955.
        await keepalive();
        idle = setInterval(() => {
            const silent = !wroteSomething;
            wroteSomething = false;
            if (silent) keepalive().catch(() => {});
        }, heartbeatMs);
        // An unref'd timer is what keeps a served process able to exit: the
        // heartbeat is a convenience for the reader, not a reason to stay alive.
        idle.unref?.();
    }
    let seq = 0;
    try {
        for await (const value of iterate) {
            if (signal.aborted) break;
            const frames = framesOf(await encoder.encode(value, seq));
            for (const frame of frames) {
                if (frameByteLength(frame) > maxFrameBytes) {
                    // A reader would refuse this frame's prefix, so sending it would
                    // end the stream at the far end with nothing to explain it. The
                    // producer's own failure is reported here and the stream closes.
                    throw Object.assign(
                        new Error(
                            `a stream frame of ${frameByteLength(frame)} bytes exceeds the ` +
                                `${maxFrameBytes}-byte limit: the route must split what it sends`,
                        ),
                        {type: 'stream.frameTooLarge', statusCode: 413},
                    );
                }
                await write(frame);
                if (signal.aborted) break;
            }
            seq += frames.length;
            if (signal.aborted) break;
        }
    } catch (error) {
        if (!signal.aborted) await write(await encoder.error(error, seq));
    } finally {
        if (idle) clearInterval(idle);
        sink.end();
    }
}

/** How many bytes a frame occupies on the wire, whichever envelope carried it. */
export function frameByteLength(frame: string | Uint8Array): number {
    if (frame instanceof Uint8Array) return frame.length;
    // A text frame is what the reader parses back into one; the payload is the
    // base64 or JSON between the markers, and it is the payload that has a limit.
    const match = /^data: (.*)\n\n$/s.exec(frame);
    return match ? match[1].length : frame.length;
}

/** How a producer asks for its values to travel together. */
export interface ICoalesceOptions {
    /** How long a value may wait for company. `0` sends each value alone. */
    maxWaitMs?: number;
    /** The most values one batch may carry. */
    maxValues?: number;
    /** The most one batch may occupy, in bytes of its payload. */
    maxFrameBytes?: number;
}

/**
 * Hold a burst of values into batches, so a delta stream costs one frame per window.
 *
 * A model emits hundreds of one- and two-character deltas a second, and one frame each is one frame
 * each on the wire, in the reader and in whatever keeps the stream. This holds what arrives for at
 * most `maxWaitMs` — imperceptible to a reader — and lets go sooner when `maxValues` arrive or when
 * the next value would push the batch past the frame cap.
 *
 * The cap is checked here as well as in the writer because a batch that grew over it would end the
 * stream with one error frame at the far end (`@@D-950`). Here it is split instead; a single value
 * over the cap is refused with the writer's own typed error, naming the producer's value.
 *
 * What comes out is a `StreamBatch`, so the writer marks it as a batch rather than mistaking a
 * handler's own array for one (`@@D-949`).
 */
export async function* coalesceStream(
    values: AsyncIterable<unknown>,
    {maxWaitMs = 75, maxValues = 64, maxFrameBytes = MAX_FRAME_BYTES}: ICoalesceOptions = {},
): AsyncIterable<StreamBatch> {
    const iterator = values[Symbol.asyncIterator]();
    /** The next value, already asked for, so a window that closes does not lose what it found. */
    let pending: Promise<IteratorResult<unknown>> | undefined;
    /** A value a full or oversized batch displaced, sent first on the next turn. */
    let heldBack: IteratorResult<unknown> | undefined;

    /** The next result, or `'timeout'` when the window closed first. */
    const next = async (windowMs: number): Promise<IteratorResult<unknown> | 'timeout'> => {
        pending ??= iterator.next();
        if (windowMs <= 0) {
            const result = await pending;
            pending = undefined;
            return result;
        }
        let timer: ReturnType<typeof setTimeout> | undefined;
        const closed = new Promise<'timeout'>(resolve => {
            timer = setTimeout(() => resolve('timeout'), windowMs);
        });
        const outcome = await Promise.race([pending.then(result => ({result})), closed]);
        if (timer) clearTimeout(timer);
        if (outcome === 'timeout') return 'timeout';
        pending = undefined;
        return (outcome as {result: IteratorResult<unknown>}).result;
    };

    const sized = (batch: StreamBatch): number => payloadOf(batch).bytes.length;
    const tooLarge = (bytes: number): Error =>
        Object.assign(
            new Error(
                `a stream value of ${bytes} bytes exceeds the ${maxFrameBytes}-byte limit: ` +
                    'the route must send it in pieces',
            ),
            {type: 'stream.frameTooLarge', statusCode: 413},
        );

    try {
        for (;;) {
            const first = heldBack ?? (await next(0));
            heldBack = undefined;
            if (first === 'timeout' || first.done) return;
            const batch: unknown[] = [first.value];
            for (;;) {
                if (batch.length >= maxValues) break;
                const more = await next(maxWaitMs);
                if (more === 'timeout') break;
                if (more.done) {
                    heldBack = more;
                    break;
                }
                batch.push(more.value);
                if (sized(new StreamBatch(batch)) > maxFrameBytes) {
                    batch.pop();
                    heldBack = more;
                    break;
                }
            }
            const single = new StreamBatch(batch);
            if (batch.length === 1 && sized(single) > maxFrameBytes) throw tooLarge(sized(single));
            yield single;
            if (heldBack?.done) return;
        }
    } finally {
        pending?.catch(() => undefined);
        await iterator.return?.();
    }
}

/**
 * A `ServerResponse` as the sink this module writes to.
 *
 * `drained` races the socket's `drain` against the abort signal, because a reader
 * that left while the loop was waiting for room would otherwise hold the producer
 * until the socket's own timeout — the one wait here with no other way out.
 */
export function nodeSink(raw: {
    write(chunk: string | Uint8Array): boolean;
    end(): void;
    once(event: 'drain' | 'close', listener: () => void): unknown;
    off(event: 'drain' | 'close', listener: () => void): unknown;
}): IFrameSink {
    return {
        write: frame => raw.write(frame),
        drained: signal =>
            new Promise<void>(resolve => {
                if (signal.aborted) return resolve();
                const done = (): void => {
                    raw.off('drain', done);
                    raw.off('close', done);
                    signal.removeEventListener('abort', done);
                    resolve();
                };
                raw.once('drain', done);
                raw.once('close', done);
                signal.addEventListener('abort', done, {once: true});
            }),
        end: () => raw.end(),
    };
}
