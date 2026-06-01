import {server} from '@feasibleone/blong';

export default server(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: ['./cucumber'],
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
            cucumber: {},
        },
        integration: {
            watch: {
                test: ['test.cucumber.calculator'],
            },
        },
    },
}));
