import {server} from '@feasibleone/blong';

export default server(blong => ({
    url: import.meta.url,
    children: ['./configReload'],
    config: {
        default: {},
        microservice: {},
        dev: {
            configReload: {},
        },
        integration: {
            configReload: {},
            remote: {canSkipSocket: true},
            watch: {
                test: ['test.config.get', 'test.config.theme.get'],
            },
        },
    },
}));
