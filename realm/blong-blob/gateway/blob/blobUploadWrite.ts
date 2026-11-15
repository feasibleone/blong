import {validation} from '@feasibleone/blong';

/**
 * `PUT /a/:namespace/u/:uploadId` — the bytes of a prepared upload.
 *
 * A raw route: no `result` schema, so the gateway answers with whatever the handler returned, and the
 * request body arrives as a stream — which the route *declares* (`rawBody: true`) rather than the
 * process. The gateway mounts it in a context that owns the parser, so no other route of the suite
 * begins accepting content types it cannot read (`@@D-860`). The bearer token is the gateway's default,
 * because writing is not something the read cookie may do (`@@D-841`).
 *
 * `bodyLimit` is declared for the record — fastify does not apply it to a stream parser, so the
 * handler counts as it pipes (`@@F-730`).
 */
export default validation(
    async ({config}) =>
        function blobUploadWrite() {
            const maxBytes = (config as {upload?: {maxBytes?: number}})?.upload?.maxBytes;
            return {
                method: 'PUT' as const,
                basePath: '/a',
                path: '/:namespace/u/:uploadId',
                rawBody: true as const,
                ...(maxBytes !== undefined && {bodyLimit: maxBytes}),
                operation: {
                    parameters: [
                        {in: 'path' as const, name: 'namespace', schema: {type: 'string'}},
                        {in: 'path' as const, name: 'uploadId', schema: {type: 'string'}},
                    ],
                },
            };
        },
);
