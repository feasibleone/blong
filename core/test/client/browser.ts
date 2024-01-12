import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: ['./adapter'],
    default: {
        error: true,
        adapter: true,
        backend: {
            logLevel: 'fatal',
            imports: [/\.backend$/, 'codec.jsonrpc', 'codec.mle'],
            url: 'http://localhost:8080',
        },
        test: {
            namespace: ['test'],
            imports: [/\.test$/],
        },
    },
    dev: {},
}));
