import type {FastifyInstance} from 'fastify';
import {Transform} from 'node:stream';

/**
 * Accept a body no parser understands, handing the handler the request stream.
 *
 * Fastify answers `415` for a content type nobody parses, so a route that receives bytes needs a
 * parser for them. The gateway calls this **inside an encapsulated context** and mounts only the route
 * that asked for it there (`rawBody: true` on the declaration) — a parser added to the instance itself
 * would make every route of the process accept content types it cannot read (`@@D-860`). `RestFs`
 * adds the same parser for its own routes.
 */
export function registerRawBody(server: FastifyInstance): void {
    server.addContentTypeParser('*', (_request, payload, done) => {
        done(null, payload);
    });
}

/**
 * Refuse a stream once it passes `max` bytes.
 *
 * A route's `bodyLimit` does not apply to a stream parser — fastify checks it while parsing a body it
 * holds, and a stream is never held — so the ceiling is enforced here, by counting (@@F-730). The
 * error carries the status a gateway answers with, which is why it is not a bare `Error`.
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
