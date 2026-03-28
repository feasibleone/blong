/**
 * blong-ttk suite - Testing Toolkit for Mojaloop and other services
 */

import {server} from '@feasibleone/blong';

export default server(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: [
        './engine',
        './callback',
        './migrate',
    ],
    config: {
        default: {
            rpcServer: {
                port: 0,
            },
            gateway: {
                port: 0,
            },
            allure: {
                outputDir: 'allure-results',
                historyPath: '.allure/history.jsonl',
                generateOnEnd: false,
                logUrl: 'http://localhost:9998/trace/{traceId}',
            },
        },
        dev: {
            engine: {},
            callback: {},
            migrate: {},
        },
        integration: {
            remote: {canSkipSocket: true},
            engine: {},
            callback: {},
            watch: {
                test: [
                    'test.engine',
                    'test.callback',
                    'test.migrate',
                ],
            },
        },
        microservice: {
            adapter: true,
            orchestrator: true,
            gateway: true,
        },
    },
}));
