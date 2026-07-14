import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({
        error: blong.type.Boolean(),
        adapter: blong.type.Boolean(),
        backend: blong.type.Object({
            logLevel: blong.type.String(),
            imports: blong.type.Array(blong.type.Unknown()),
            url: blong.type.Optional(blong.type.String()),
            port: blong.type.Optional(blong.type.Unknown()),
            host: blong.type.Optional(blong.type.String()),
            protocol: blong.type.Optional(blong.type.String()),
            manifestPort: blong.type.Optional(blong.type.String()),
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
                host: 'localhost',
                protocol: 'http',
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
