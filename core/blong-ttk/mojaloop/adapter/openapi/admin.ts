import {handler} from '@feasibleone/blong';

/**
 * OpenAPI adapter configuration for Mojaloop Admin API.
 *
 * This provides the Admin API client (participants, endpoints, limits) for provisioning.
 * Used by test setup to create DFSPs, register endpoints, and configure limits.
 *
 * Methods available:
 * - adminParticipantCreate: POST /participants
 * - adminParticipantGet: GET /participants/{name}
 * - adminParticipantList: GET /participants
 * - adminEndpointAdd: POST /participants/{name}/endpoints
 * - adminLimitSet: POST /participants/{name}/limits
 * - adminAccountCreate: POST /participants/{name}/accounts
 * - adminPartyRegister: POST /parties
 */
export default handler(proxy => ({
    config: {
        api: {
            namespace: {
                admin: [
                    new URL('../../api/admin.yaml', import.meta.url).href,
                    new URL('../../api/admin.operations.yaml', import.meta.url).href,
                    {servers: [{url: 'http://localhost:4001'}]},
                ],
            },
        },
    },
    namespace: ['admin'],
}));
