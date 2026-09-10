import {server} from '@feasibleone/blong';

/**
 * blong-int-sql: Demonstrates integration tests with a MySQL server
 */
export default server(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: ['./mysql'],
    config: {
        default: {
            rpcServer: {port: 0},
            gateway: {port: 0},
            mysql: {},
        },
        microservice: {},
        integration: {
            watch: {
                test: ['test.mysql.query', 'test.mysql.deadlock'],
            },
        },
    },
}));
