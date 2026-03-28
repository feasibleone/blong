import {orchestrator} from '@feasibleone/blong';

/**
 * OpenAPI orchestrator for Mojaloop APIs.
 *
 * This extends the blong-openapi orchestrator to provide HTTP client functionality
 * for FSPIOP and Admin APIs. The orchestrator:
 * 1. Loads OpenAPI specs from adapter/openapi/*.ts files
 * 2. Creates handler proxies for each operation
 * 3. Maps x-blong-method names to HTTP operations
 * 4. Handles request/response serialization
 */
export default orchestrator(() => ({
    extends: 'orchestrator.openapi',
    activation: {
        default: {
            logLevel: 'info',
        },
        dev: {
            logLevel: 'debug',
        },
        integration: {
            logLevel: 'info',
        },
    },
}));
