import {server} from '@feasibleone/blong';

export default server(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: ['./nscfg'],
    config: {
        default: {
            rpcServer: {
                port: 0,
            },
            gateway: {
                port: 0,
            },
        },
        integration: {
            nscfg: {},
            remote: {canSkipSocket: true},
            watch: {
                test: ['test.cfg.get'],
            },
        },
    },
}));
