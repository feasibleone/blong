/**
 * Stream helpers a handler may use on a body the gateway hands it as a stream.
 *
 * A route that asked for its body as a stream (`rawBody: true`) is given the request stream, and
 * fastify's `bodyLimit` does not apply to it: the limit is checked while a body it holds is parsed,
 * and a stream is never held. The ceiling therefore has to be enforced by whoever reads the stream,
 * which is the handler — so the enforcement lives in the package a realm may import rather than in the
 * runtime, which a realm must not depend on (`@@F-730`, `@@D-860`).
 *
 * Server-only, and not exported from the package root for that reason: the root is type-checked by
 * browser code too, and `node:stream` has no meaning there (`@@D-869`).
 */
import {Transform} from 'node:stream';

/**
 * Refuse a stream once it passes `max` bytes.
 *
 * The error carries the status a gateway answers with, which is why it is not a bare `Error`: a
 * realm's upload route reports the refusal as `413` without translating it (`@@F-730`).
 */
export function limitBytes(max: number): Transform {
    let seen = 0;
    return new Transform({
        transform(chunk: Buffer, _encoding, callback) {
            seen += chunk.length;
            if (seen > max) {
                callback(
                    Object.assign(new Error(`The body exceeds ${max} bytes`), {
                        statusCode: 413,
                        type: 'blob.tooLarge',
                        params: {size: seen, limit: max},
                    }),
                );
                return;
            }
            callback(null, chunk);
        },
    });
}
