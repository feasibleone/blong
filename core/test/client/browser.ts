import { createRequire } from 'node:module';

import { realm } from '@feasibleone/blong';

export default realm(fo => ({
    pkg: createRequire(import.meta.url)('./package.json'),
    default: {
        error: true,
        adapter: true,
        backend: {
            logLevel: 'fatal',
            imports: ['codec.jsonrpc', 'codec.mle', /\.backend$/],
            url: 'http://localhost:8080'
        },
        test: {
            namespace: ['test'],
            imports: [/\.test$/]
        }
    },
    dev: {},
    validation: fo.Type.Object({}),
    url: import.meta.url,
    children: [
        './adapter'
    ]
}));
