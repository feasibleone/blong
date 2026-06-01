import {server} from '@feasibleone/blong';

/**
 * blong-sim-api: Demonstrates OpenAPI backend simulation using orchestrator.openapi.
 *
 * The time realm implements an HTTP adapter calling a world-time REST API (via OpenAPI spec).
 * In integration mode, the sim layer activates a mock OpenAPI server (via blong-openapi)
 * that serves the world-time API spec using local handler implementations, enabling
 * tests to run without an external internet dependency.
 */
export default server(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: [
        async function openapi() {
            return import('@feasibleone/blong-openapi/server.ts');
        },
        './time',
    ],
    config: {
        default: {
            rpcServer: {port: 0},
            gateway: {port: 0},
            time: {},
        },
        microservice: {
            openapi: {
                orchestrator: true,
                gateway: {port: 8082},
            },
        },
        integration: {
            gateway: {port: 8082},
            watch: {
                test: ['test.time.get', 'test.time.clock'],
            },
        },
    },
}));
