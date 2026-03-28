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
        './adapter/openapi/fspiop',
        './adapter/openapi/admin',
    ],
    config: {
        default: {},
        dev: {
            openapi: true,
        },
        integration: {
            openapi: true,
        },
    },
}));
