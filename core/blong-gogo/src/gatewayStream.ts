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
 * - **Heartbeat.** A comment frame while nothing is being written keeps an idle
 *   proxy or ingress from closing a connection the reader still wants. It is a
 *   comment, not an event, so a client that reads only `data:` never sees it.
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
    STREAM_FLAG_BINARY,
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

/** What one value becomes: its bytes, and whether those bytes are JSON. */
export function payloadOf(value: unknown): {bytes: Uint8Array; binary: boolean} {
    if (value instanceof Uint8Array) return {bytes: value, binary: true};
    const json = typeof value === 'string' ? value : JSON.stringify(value ?? null);
    return {bytes: new TextEncoder().encode(json), binary: false};
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
    encode(value: unknown, seq: number): Promise<string | Uint8Array>;
    /** The last frame, written after a producer failed. */
    error(error: unknown, seq: number): Promise<string | Uint8Array>;
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
            if (envelope === 'text') return dataFrame(value);
            const {bytes, binary} = payloadOf(value);
            return binaryFrame(binary ? FLAG_BINARY : 0, bytes);
        },
        error: async (error: unknown) => {
            if (envelope === 'text') return dataFrame(errorPayload(error));
            return binaryFrame(0, payloadOf(errorPayload(error)).bytes);
        },
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
            const {sealed} = await seal(value, seq);
            if (envelope === 'binary') return binaryFrame(FLAG_SEALED, sealed);
            return `data: ${toBase64(sealed)}\n\n`;
        },
        error: async (error: unknown, seq: number) => {
            const {sealed} = await seal(errorPayload(error), seq);
            if (envelope === 'binary') return binaryFrame(FLAG_SEALED, sealed);
            return `data: ${toBase64(sealed)}\n\n`;
        },
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
    /** How often an idle stream writes a comment frame. Text envelope only. */
    heartbeatMs?: number;
    /** Whether to write those comments at all. */
    heartbeat?: boolean;
    /** The most one frame may occupy. A producer above it ends the stream. */
    maxFrameBytes?: number;
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
    if (heartbeat && heartbeatMs > 0) {
        idle = setInterval(() => {
            if (!wroteSomething && !signal.aborted) sink.write(': ping\n\n');
            wroteSomething = false;
        }, heartbeatMs);
        // An unref'd timer is what keeps a served process able to exit: the
        // heartbeat is a convenience for the reader, not a reason to stay alive.
        idle.unref?.();
    }
    const write = async (frame: string | Uint8Array): Promise<void> => {
        wroteSomething = true;
        if (sink.write(frame)) return;
        await sink.drained(signal);
    };
    let seq = 0;
    try {
        for await (const value of iterate) {
            if (signal.aborted) break;
            const frame = await encoder.encode(value, seq);
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
            seq += 1;
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
