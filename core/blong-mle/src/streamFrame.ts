/**
 * The frame format of a stream, shared by the writer and the reader (`@@D-949`).
 *
 * A frame is `[u32 length][u8 flags][payload]`, and a sealed payload starts with
 * its own eight-byte sequence number because that number is the nonce's tail. The
 * length is what makes the envelope self-delimiting — a reader that receives a
 * chunk of any size can find the frames in it — and it is also the one field an
 * attacker controls, which is why the reader refuses a length it will not wait
 * for before it allocates anything.
 *
 * That refusal is the whole point of `STREAM_MAX_FRAME_BYTES`: a peer that
 * announces four gigabytes and then trickles bytes is asking the reader to hold
 * four gigabytes, and a reader that believes it is a memory problem with nothing
 * on the wire to debug. The cap is the ceiling a frame may occupy, so the buffer
 * a reader keeps while waiting for one is bounded by it plus a prefix.
 *
 * Environment-neutral on purpose — `globalThis` only, no `Buffer` — because the
 * same module parses frames in a browser and in a Node tool.
 */

/** The most one frame may carry, payload included. */
export const STREAM_MAX_FRAME_BYTES = 1 << 20;

/**
 * What a frame is bound to: the method it was asked for.
 *
 * One spelling for both sides — a frame sealed under a different string opens
 * under neither, and only a mismatch nobody can read would say so.
 */
export function streamInfoOf(method: string): string {
    return `blong.stream.v1:${method}`;
}

/** The envelope a person can read, and what `curl` prints. */
export const STREAM_TEXT_TYPE = 'text/event-stream';

/** The envelope a program reads: length, then flags and payload. */
export const STREAM_BINARY_TYPE = 'application/vnd.blong.stream';

/** A frame whose payload was sealed. */
export const STREAM_FLAG_SEALED = 1;

/** A frame whose payload is bytes rather than JSON. */
export const STREAM_FLAG_BINARY = 2;

/**
 * A frame that carries **several** values, as a JSON array.
 *
 * One frame per value is what a writer does today, and a consumer must not assume
 * it: a writer is free to hold values and send them together — that is a wire
 * efficiency decision, and buffering a burst into one frame is exactly the kind of
 * thing that changes with load. The flag is what makes the difference explicit, so
 * an array a handler *yielded* is never confused with a batch (§ a producer that
 * yields an array sends one value, `FLAG_BINARY` clear and `FLAG_BATCH` clear).
 */
export const STREAM_FLAG_BATCH = 4;

/**
 * A frame that carries no value: the writer saying the stream is alive @@D-955.
 *
 * The text envelope has always had this — an SSE comment line between events — and the binary one had
 * nothing, so a reader of a quiet stream could not tell it from a dead one, and a proxy holding the
 * response until its first byte kept the headers back indefinitely. A keepalive is a frame with no
 * payload and this flag, which every reader skips: it says only that the producer is still there.
 *
 * It is deliberately never sealed. Sealing it would spend a sequence number on nothing and make the
 * reader do crypto to learn that nothing happened; an empty frame has no content to protect, and the
 * numbering of sealed frames stays the writer's to keep aligned @@D-955.
 */
export const STREAM_FLAG_KEEPALIVE = 8;

/**
 * The values one frame delivers — at least one, and more when it was batched.
 *
 * The payload is the frame's *plaintext*: a sealed frame is opened first, and this
 * is what turns what arrived into what the producer yielded.
 */
export function valuesOfFrame(flags: number, payload: Uint8Array): unknown[] {
    // A keepalive is not a value: a reader waiting for one waits for the next frame.
    if ((flags & STREAM_FLAG_KEEPALIVE) !== 0) return [];
    if ((flags & STREAM_FLAG_BINARY) !== 0) return [payload];
    const text = new TextDecoder().decode(payload);
    if (text.length === 0) return [];
    const parsed = JSON.parse(text) as unknown;
    if ((flags & STREAM_FLAG_BATCH) !== 0 && Array.isArray(parsed)) return parsed;
    return [parsed];
}

/** Bytes of the length prefix. */
export const STREAM_PREFIX_BYTES = 4;

/** One frame as it arrived. */
export interface IStreamFrame {
    flags: number;
    payload: Uint8Array;
}

/** A frame the reader will not carry, named so a caller can report it. */
export class StreamFrameTooLarge extends Error {
    readonly type = 'stream.frameTooLarge';
    readonly statusCode = 413;
    /** What the peer announced. */
    readonly declared: number;
    /** What this reader will carry. */
    readonly limit: number;
    // Written out rather than a parameter property: Node strips types instead of
    // compiling them, and a parameter property is syntax it refuses.
    constructor(declared: number, limit: number) {
        super(`stream frame of ${declared} bytes exceeds the ${limit}-byte limit`);
        this.name = 'StreamFrameTooLarge';
        this.declared = declared;
        this.limit = limit;
    }
}

/** One frame: its length, its flags, its payload. */
export function encodeFrame(flags: number, payload: Uint8Array): Uint8Array {
    const frame = new Uint8Array(STREAM_PREFIX_BYTES + 1 + payload.length);
    new DataView(frame.buffer).setUint32(0, frame.length - STREAM_PREFIX_BYTES, false);
    frame[STREAM_PREFIX_BYTES] = flags;
    frame.set(payload, STREAM_PREFIX_BYTES + 1);
    return frame;
}

/** Base64, in whichever environment is asking. */
export function toBase64(bytes: Uint8Array): string {
    const runtime = globalThis as {Buffer?: {from(input: Uint8Array): {toString(encoding: string): string}}};
    if (runtime.Buffer) return runtime.Buffer.from(bytes).toString('base64');
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return globalThis.btoa(binary);
}

/**
 * The inverse, with the same portability.
 *
 * It accepts the URL-safe alphabet as well as the plain one: a salt travels in a
 * header, where `-` and `_` are the spelling that survives, and a header value is
 * not a place to require a caller to translate. Plain base64 never contains either
 * character, so nothing is ambiguous (`@@F-787`).
 */
export function fromBase64(text: string): Uint8Array {
    const plain = text.replace(/-/g, '+').replace(/_/g, '/');
    const runtime = globalThis as {Buffer?: {from(input: string, encoding: string): Uint8Array}};
    if (runtime.Buffer) return new Uint8Array(runtime.Buffer.from(plain, 'base64'));
    return Uint8Array.from(globalThis.atob(plain), character => character.charCodeAt(0));
}

export interface IFrameDecoderOptions {
    /** The largest frame this reader will wait for. */
    maxFrameBytes?: number;
}

export interface IFrameDecoder {
    /** Every frame the bytes received so far complete, in order. */
    push(chunk: Uint8Array): IStreamFrame[];
}

/**
 * A reader that cuts frames out of a byte stream and refuses an impossible one.
 *
 * The check happens on the prefix, before the frame's bytes are accumulated: a
 * length above the cap throws rather than becoming a buffer. Once a valid prefix
 * is being waited on, the bytes held are bounded by the cap itself — so no chunk
 * size and no trickle from the peer can make the reader grow past it.
 */
export function frameDecoder({
    maxFrameBytes = STREAM_MAX_FRAME_BYTES,
}: IFrameDecoderOptions = {}): IFrameDecoder {
    let buffer = new Uint8Array(0);
    return {
        push(chunk: Uint8Array): IStreamFrame[] {
            const merged = new Uint8Array(buffer.length + chunk.length);
            merged.set(buffer);
            merged.set(chunk, buffer.length);
            buffer = merged;
            const frames: IStreamFrame[] = [];
            for (;;) {
                if (buffer.length < STREAM_PREFIX_BYTES) break;
                const length = new DataView(
                    buffer.buffer,
                    buffer.byteOffset,
                    STREAM_PREFIX_BYTES,
                ).getUint32(0, false);
                if (length > maxFrameBytes) throw new StreamFrameTooLarge(length, maxFrameBytes);
                if (buffer.length < STREAM_PREFIX_BYTES + length) break;
                const flags = buffer[STREAM_PREFIX_BYTES];
                const payload = buffer.slice(STREAM_PREFIX_BYTES + 1, STREAM_PREFIX_BYTES + length);
                buffer = buffer.slice(STREAM_PREFIX_BYTES + length);
                frames.push({flags, payload});
            }
            return frames;
        },
    };
}
