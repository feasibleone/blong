import type {FastifyInstance} from 'fastify';

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
 * The implementation moved to the package a realm may import: the handler that reads a raw body is the
 * one that must count it, and a realm importing this file failed to load in a deployment where the
 * runtime is a binary rather than a dependency — `Cannot find package '@feasibleone/blong-gogo'`
 * stopped the suite's migration Job and the pods beside it (`@@F-750`). One implementation, re-exported
 * here so the runtime's own callers and its test keep their import.
 */
export {limitBytes} from '@feasibleone/blong/stream';
