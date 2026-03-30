import {server} from '@feasibleone/blong';

export default server(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: ['./order'],
    config: {
        default: {
            rpcServer: {
                port: 0,
            },
            gateway: {
                port: 0,
            },
        },
        dev: {
            order: {},
        },
        integration: {
            remote: {canSkipSocket: true},
            watch: {
                test: [
                    'test.order.checkpoint',
                    'test.order.graduate',
                    'test.order.invariant',
                    'test.order.canary',
                ],
            },
        },
    },
}));
