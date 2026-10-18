import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({
        error: blong.type.Boolean(),
        adapter: blong.type.Boolean(),
        backend: blong.type.Boolean(),
        /**
         * The server-hosted Test runs console: `serverGroups` is the allowlist of
         * server test groups a caller may start, so a suite opens just its own.
         */
        testRun: blong.type.Optional(
            blong.type.Object({
                serverGroups: blong.type.Optional(blong.type.Array(blong.type.String())),
            }),
        ),
        /** The `test.run.*` dispatch port; a suite configures it when it adds its own groups. */
        testDispatch: blong.type.Optional(
            blong.type.Object({
                namespace: blong.type.Optional(blong.type.String()),
                imports: blong.type.Optional(blong.type.Array(blong.type.Unknown())),
                validations: blong.type.Optional(blong.type.Array(blong.type.String())),
            }),
        ),
    }),
    children: ['./adapter'],
    config: {
        default: {
            error: true,
            adapter: true,
            backend: false,
        },
        dev: {},
    },
}));
