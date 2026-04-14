import {server} from '@feasibleone/blong';

export default server(blong => ({
    url: import.meta.url,
    children: ['./configReload'],
    config: {
        default: {
            rpcServer: {port: 0},
            gateway: {port: 0},
        },
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
