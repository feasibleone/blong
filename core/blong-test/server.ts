import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({
        error: blong.type.Boolean(),
        adapter: blong.type.Boolean(),
        backend: blong.type.Boolean(),
        test: blong.type.Object({}),
    }),
    children: ['./adapter'],
    config: {
        default: {
            error: true,
            adapter: true,
            backend: false,
            testDispatch: {
                namespace: ['test'],
                imports: [/\.test$/],
            },
        },
        dev: {},
    },
}));
