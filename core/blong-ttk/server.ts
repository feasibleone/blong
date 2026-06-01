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
        './mojaloop/realm',
        async () => import('@feasibleone/blong-openapi/server.js'),
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
                categoriesPath: new URL('./config/categories.json', import.meta.url).pathname,
            },
        },
        dev: {
            engine: {},
            callback: {},
            migrate: {},
            mojaloop: {
                openapi: true,
            },
        },
        integration: {
            engine: {},
            callback: {},
            mojaloop: {
                openapi: true,
            },
            watch: {
                test: ['test.engine', 'test.callback', 'test.migrate'],
            },
        },
        microservice: {
            adapter: true,
            orchestrator: true,
            gateway: true,
        },
    },
}));
