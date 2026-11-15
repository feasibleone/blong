import {validation} from '@feasibleone/blong';

/** `HEAD /a/:namespace/:key` — the headers a cache needs, and no body. */
export default validation(
    async () =>
        function blobHead() {
            return {
                method: 'HEAD' as const,
                basePath: '/a',
                path: '/:namespace/:key',
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
