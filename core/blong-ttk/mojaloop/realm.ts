import {realm} from '@feasibleone/blong';

/**
 * Mojaloop API client realm.
 *
 * Provides HTTP client adapters for:
 * - FSPIOP API (transfers, quotes, parties)
 * - Admin API (participants, endpoints, limits)
 *
 * Used by test collections to interact with Mojaloop services.
 */
export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: [
        './orchestrator/openapi',
        './orchestrator/provision/provisionParticipantCreate',
        './orchestrator/provision/provisionPartyCreate',
        './orchestrator/provision/provisionEndpointAdd',
        './orchestrator/provision/provisionLimitAdd',
        './orchestrator/provision/cleanupStaleRemove',
        './adapter/openapi/fspiop',
        './adapter/openapi/admin',
    ],
    config: {
        default: {},
        dev: {
            openapi: true,
            provision: true,
        },
        integration: {
            openapi: true,
            provision: true,
        },
    },
}));
