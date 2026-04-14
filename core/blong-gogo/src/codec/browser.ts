import {realm} from '@feasibleone/blong/types';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: globalThis.window
        ? import.meta.glob(['./adapter/**/*.ts', './test/**/*.ts'])
        : ['./adapter', './test'],
    config: {
        default: {
            adapter: true,
        },
        dev: {},
        microservice: {},
        integration: {
            test: true,
        },
    },
}));
