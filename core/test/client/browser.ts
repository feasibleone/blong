import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({
        error: blong.type.Boolean(),
        adapter: blong.type.Boolean(),
        backend: blong.type.Object({
            logLevel: blong.type.String(),
            imports: blong.type.Array(blong.type.Unknown()),
            url: blong.type.String(),
        }),
        test: blong.type.Object({}),
    }),
    children: ['./adapter'],
    config: {
        default: {
            error: true,
            adapter: true,
            backend: {
                logLevel: 'fatal',
                imports: [/\.backend$/, 'codec.jsonrpc', 'codec.mle'],
                url: 'http://localhost:8080',
            },
            testDispatch: {
                namespace: ['test'],
                imports: [/\.test$/],
            },
        },
        dev: {},
    },
}));
