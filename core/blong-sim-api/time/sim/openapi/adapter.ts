import {handler} from '@feasibleone/blong';

/**
 * OpenAPI mock server configuration for the world-time API.
 *
 * This handler provides configuration to the orchestrator.openapi (from blong-openapi),
 * which serves the world-time API spec at port 8082 in integration mode.
 *
 * The pattern works as follows:
 * 1. The orchestrator.openapi imports handler groups matching /(?<!codec)\.openapi$/
 * 2. This handler (in the time.openapi group) provides namespace configuration
 * 3. The orchestrator loads the world-time OpenAPI spec and serves it at port 8082
 * 4. Incoming requests are dispatched to handlers matching the x-blong-method
 * 5. mocktimeGet.ts handles GET /timezone/{area}/{location} requests
 *
 * The namespace 'mocktime' under the openapi orchestrator is how blong-openapi
 * identifies this API instance.
 */
export default handler(proxy => ({
    config: {
        api: {
            namespace: {
                mocktime: [
                    new URL('../../api/world-time.yaml', import.meta.url).href,
                    new URL('../../api/world-time.operations.yaml', import.meta.url).href,
                    {servers: [{url: 'http://localhost:8082'}]},
                ],
            },
        },
    },
    namespace: ['mocktime'],
}));
