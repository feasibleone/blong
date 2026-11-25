/**
 * A subscription that survives its connection (`@@D-949`).
 *
 * A stream is one attempt: the route holds it open while it has something to say, and the transport
 * ends it when a proxy times out, a pod restarts or a socket drops. The values it carried are not
 * lost with it, because the route names where it got to — the resume token is the route's own field,
 * and this module's only job is to carry it into the next attempt.
 *
 * Nothing here parses a frame (`readStream` does that) and nothing here knows what a token looks
 * like (`tokenOf` reads it off a value). So the same helper serves a session tail, a log wake and
 * whatever feeds come next: what differs between them is a route, not a transport.
 */
import {readStream, type IStreamResponse} from './streamRead.ts';

export interface ISubscribeOptions<T> {
    /** One attempt: the response to a call that resumes after `after`, or the first attempt's. */
    open: (after: string | undefined) => Promise<IStreamResponse>;
    /** The token a value carries: the route's own field. Absent for a route that sends none. */
    tokenOf?: (value: T) => string | undefined;
    /** The key a sealed stream is opened with, and what its frames are bound to. */
    key?: CryptoKey;
    info?: string;
    /** How many attempts may follow an attempt that ended. `0` — the default — never reopens. */
    retries?: number;
    /** How long to wait before the next attempt. */
    retryDelayMs?: number;
    /** A reader that left: the subscription stops, and no error is raised. */
    signal?: AbortSignal;
    /** The largest frame this subscription will wait for. */
    maxFrameBytes?: number;
}

/** Resolve after `ms`, or as soon as the caller aborts. */
async function wait(ms: number, signal?: AbortSignal): Promise<void> {
    if (ms <= 0 || signal?.aborted) return;
    await new Promise<void>(resolve => {
        const done = (): void => {
            clearTimeout(timer);
            signal?.removeEventListener('abort', done);
            resolve();
        };
        const timer = setTimeout(done, ms);
        signal?.addEventListener('abort', done, {once: true});
    });
}

/**
 * The values of a stream, across the attempts that carry it.
 *
 * A value whose token equals the one the attempt was opened with is a repeat the route did not
 * honour, and is skipped rather than delivered twice; everything else is yielded as it arrives, in
 * order. An attempt that fails is retried while the budget lasts, and the last failure is thrown
 * once it does not — a stream that keeps failing is the caller's to report, not something to hide
 * behind a subscription that quietly stopped.
 */
export async function* subscribeStream<T>({
    open,
    tokenOf,
    key,
    info,
    retries = 0,
    retryDelayMs = 1000,
    signal,
    maxFrameBytes,
}: ISubscribeOptions<T>): AsyncIterable<T> {
    let after: string | undefined;
    let attempt = 0;
    let failure: unknown;

    for (;;) {
        if (signal?.aborted) return;
        failure = undefined;
        let response: IStreamResponse | undefined;
        try {
            response = await open(after);
        } catch (error) {
            failure = error;
        }
        if (response) {
            try {
                for await (const value of readStream(response, {key, info, maxFrameBytes})) {
                    const next = tokenOf?.(value as T);
                    if (next !== undefined) {
                        if (next === after) continue;
                        after = next;
                    }
                    yield value as T;
                    if (signal?.aborted) return;
                }
            } catch (error) {
                failure = error;
            }
        }
        if (signal?.aborted) return;
        if (attempt >= retries) {
            if (failure) throw failure;
            return;
        }
        attempt += 1;
        await wait(retryDelayMs, signal);
    }
}
