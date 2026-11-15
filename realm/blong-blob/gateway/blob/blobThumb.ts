import {validation} from '@feasibleone/blong';

/**
 * `GET /a/:namespace/:key/thumb` — the thumbnail a blob recorded, or a `404` when it records none.
 *
 * The route exists before any variant does: a browser asks for a thumbnail of every image it shows,
 * and answering `404` is how it learns to fall back to the original (@@D-844).
 */
export default validation(
    async () =>
        function blobThumb() {
            return {
                method: 'GET' as const,
                basePath: '/a',
                path: '/:namespace/:key/thumb',
                auth: false,
                operation: {
                    parameters: [
                        {in: 'path' as const, name: 'namespace', schema: {type: 'string'}},
                        {in: 'path' as const, name: 'key', schema: {type: 'string'}},
                    ],
                },
            };
        },
);
