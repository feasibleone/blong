/**
 * Turning a streamed response into the values the producer yielded (`@@D-949`).
 *
 * This is the consumer half of the transport, and the one place that knows both
 * envelopes, the frame format and how to open a sealed frame. A caller — a page, a
 * CLI tool, a test — gets an async iterable of values and never sees a length
 * prefix, a flag byte, a base64 line or a nonce.
 *
 * Two things it deliberately does *not* assume:
 *
 * - **one frame per value.** A frame may carry several (`STREAM_FLAG_BATCH`), so
 *   every frame is flattened and a consumer waiting for "the next value" waits for
 *   a frame only in the sense that it waits for whatever carries one.
 * - **that the transport delivers whole frames.** Chunks arrive where the network
 *   put them, so the binary envelope is fed through the shared decoder, which keeps
 *   the partial head and refuses a length it will not carry.
 *
 * The text envelope carries one value per event and is never sealed-and-batched:
 * it exists for a person reading the wire, and a reader who wants batching is a
 * program reading the binary one.
 */

import {openFrame} from './streamCipher.ts';
import {
    STREAM_FLAG_SEALED,
    STREAM_MAX_FRAME_BYTES,
    frameDecoder,
    fromBase64,
    valuesOfFrame,
} from './streamFrame.ts';

/** The two header shapes the transports hand over: a Fetch `Headers`, or a plain bag. */
export type StreamHeaders =
    | {get(name: string): string | null}
    | Record<string, string | string[] | undefined>;

/** What a streamed response offers: bytes, and the headers that describe them. */
export interface IStreamResponse {
    headers: StreamHeaders;
    body: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array> | null;
}

/** One header, whichever shape the transport used. */
function headerOf(headers: StreamHeaders, name: string): string | undefined {
    if (typeof (headers as {get?: unknown}).get === 'function') {
        return (headers as {get(name: string): string | null}).get(name) ?? undefined;
    }
    const bag = headers as Record<string, string | string[] | undefined>;
    const value = bag[name] ?? bag[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
}

export interface IReadStreamOptions {
    /** The key the frames are sealed with, when the response announced a salt. */
    key?: CryptoKey;
    /** What a frame is bound to: the method it was asked for. */
    info?: string;
    /** The largest frame this reader will wait for. */
    maxFrameBytes?: number;
}

/** The salt a sealed response announces, or `undefined` for a plain one. */
export function streamSalt(response: IStreamResponse): Uint8Array | undefined {
    const value = headerOf(response.headers, 'x-blong-stream-salt');
    return value ? fromBase64(value) : undefined;
}

/** Whether the response is the readable envelope. */
export function isTextStream(response: IStreamResponse): boolean {
    return (headerOf(response.headers, 'content-type') ?? '').includes('text/event-stream');
}

/** The bytes of a response body, however the transport hands them over. */
async function* chunksOf(
    body: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>,
): AsyncIterable<Uint8Array> {
    if (typeof (body as ReadableStream<Uint8Array>).getReader === 'function') {
        const reader = (body as ReadableStream<Uint8Array>).getReader();
        try {
            for (;;) {
                const {value, done} = await reader.read();
                if (done) return;
                if (value) yield value;
            }
        } finally {
            // Leaving the loop early (a page navigated away, a `break`) has to end
            // the response too: a locked reader that is only released leaves the
            // connection open, and the server keeps a producer running for a
            // reader that is gone.
            await reader.cancel().catch(() => {});
            reader.releaseLock();
        }
        return;
    }
    yield* body as AsyncIterable<Uint8Array>;
}

/** One text-envelope payload, decoded the way the header says it was written. */
async function* textValues(
    body: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>,
    {key, info, sealed}: {key?: CryptoKey; info?: string; sealed: boolean},
): AsyncIterable<unknown> {
    const decoder = new TextDecoder();
    let buffer = '';
    let seq = 0;
    for await (const chunk of chunksOf(body)) {
        buffer += decoder.decode(chunk, {stream: true});
        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) {
            const event = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            boundary = buffer.indexOf('\n\n');
            // `:` lines are keep-alive's and have no value; a `data:` line is the
            // payload, and a value is never split across several of them here.
            const data = event
                .split('\n')
                .filter(line => line.startsWith('data:'))
                .map(line => line.slice(5).trimStart())
                .join('\n');
            if (data.length === 0) continue;
            if (!sealed) {
                yield JSON.parse(data) as unknown;
                continue;
            }
            if (!key) throw new Error('a sealed stream needs its key to be opened');
            const opened = await openFrame(key, seq++, fromBase64(data), info ?? '');
            for (const value of valuesOfFrame(0, opened)) yield value;
        }
    }
}

/** Every value a streamed response carries, in the order the producer yielded them. */
export async function* readStream(
    response: IStreamResponse,
    {key, info, maxFrameBytes = STREAM_MAX_FRAME_BYTES}: IReadStreamOptions = {},
): AsyncIterable<unknown> {
    const body = response.body;
    if (!body) return;
    const sealed = streamSalt(response) !== undefined;
    if (isTextStream(response)) {
        yield* textValues(body, {key, info, sealed});
        return;
    }
    const decoder = frameDecoder({maxFrameBytes});
    let seq = 0;
    for await (const chunk of chunksOf(body)) {
        for (const frame of decoder.push(chunk)) {
            const flags = frame.flags;
            if ((flags & STREAM_FLAG_SEALED) === 0) {
                for (const value of valuesOfFrame(flags, frame.payload)) yield value;
                continue;
            }
            if (!key) throw new Error('a sealed stream needs its key to be opened');
            const opened = await openFrame(key, seq++, frame.payload, info ?? '');
            // The opened payload is JSON or bytes; a batch flag says it is a JSON
            // array of values, which is the writer's choice and not a promise.
            for (const value of valuesOfFrame(flags, opened)) yield value;
        }
    }
}
