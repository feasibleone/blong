import {adapter} from '@feasibleone/blong';

/**
 * HTTP adapter for world-time API integration.
 *
 * Uses codec.openapi to map OpenAPI operation IDs to handler methods.
 * In integration mode, this adapter is configured to call the local mock server
 * (started by the sim layer) instead of the real world-time API.
 *
 * The namespace/import mapping (configured in time/server.ts) tells the adapter
 * which handler group to use for request/response transformation.
 */
export default adapter<{
    'codec.openapi': unknown;
}>(blong => ({
    extends: 'adapter.http',
    activation: {
        default: {
            namespace: ['time'],
            imports: ['codec.openapi'],
            logLevel: 'info',
        },
        integration: {
            'codec.openapi': {
                namespace: {
                    time: 'time.world-time',
                },
            },
        },
    },
}));
