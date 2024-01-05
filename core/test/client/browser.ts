import {createRequire} from 'node:module';

import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    pkg: createRequire(import.meta.url)('./package.json'),
    default: {
        error: true,
        adapter: true,
        backend: {
            logLevel: 'fatal',
            imports: ['codec.jsonrpc', 'codec.mle', /\.backend$/],
            url: 'http://localhost:8080',
        },
        test: {
            namespace: ['test'],
            imports: [/\.test$/],
        },
    },
    dev: {},
    validation: blong.type.Object({}),
    url: import.meta.url,
    children: ['./adapter'],
}));
