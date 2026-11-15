import {validation} from '@feasibleone/blong';

/**
 * `GET /a/:namespace/:key` — the bytes themselves, authorised by the scope cookie.
 *
 * `auth: false` is the point of the dedicated path: a browser element fetching an image sends no
 * bearer token, and the scope cookie is what stands in its place (@@D-836).
 */
export default validation(
    async () =>
        function blobRead() {
            return {
                method: 'GET' as const,
                basePath: '/a',
                path: '/:namespace/:key',
                auth: false,
                operation: {
                    parameters: [
                        {in: 'path' as const, name: 'namespace', schema: {type: 'string'}},
                        {in: 'path' as const, name: 'key', schema: {type: 'string'}},
                        {in: 'query' as const, name: 'download', schema: {type: 'string'}},
                    ],
                },
            };
        },
);
