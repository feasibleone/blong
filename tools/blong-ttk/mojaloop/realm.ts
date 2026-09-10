import {realm} from '@feasibleone/blong';

/**
 * Mojaloop API client realm.
 *
 * Provides HTTP client adapters wired via orchestrator.openapi for:
 * - FSPIOP API (transfers, quotes, parties) — namespace: fspiop
 * - Admin API  (participants, endpoints, limits) — namespace: admin
 *
 * Handler naming follows semantic triple convention:
 *   transferTransferCreate, quoteQuoteCreate, partyPartyGet, ...
 *   adminParticipantCreate, adminEndpointAdd, adminLimitSet, ...
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
        default: {
            // OpenAPI namespace config consumed by orchestrator.openapi.
            // Lists spec files and server overrides for each API namespace.
            openapi: {
                logLevel: 'info' as const,
                api: {
                    namespace: {
                        fspiop: 'mojaloop.fspiop',
                        admin: 'mojaloop.admin',
                    },
                },
            },
        },
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
