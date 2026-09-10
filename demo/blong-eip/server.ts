import {server} from '@feasibleone/blong';

export default server(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: ['./eip'],
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
            eip: {},
        },
        integration: {
            watch: {
                test: [
                    'test.eip.return',
                    'test.eip.pipes',
                    'test.eip.route',
                    'test.eip.dynamic',
                    'test.eip.filter',
                    'test.eip.recipient',
                    'test.eip.split',
                    'test.eip.aggregate',
                    'test.eip.sort',
                    'test.eip.compose',
                    'test.eip.scatter',
                    'test.eip.wrap',
                    'test.eip.enrich',
                    'test.eip.simplify',
                    'test.eip.claim',
                    'test.eip.normalize',
                ],
            },
        },
    },
}));
