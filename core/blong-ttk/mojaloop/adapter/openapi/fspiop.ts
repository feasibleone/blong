import {handler} from '@feasibleone/blong';

/**
 * OpenAPI adapter configuration for Mojaloop FSPIOP API.
 *
 * This provides the FSPIOP API client (transfers, quotes, parties) to test collections.
 * The blong-openapi orchestrator loads the spec and creates handler proxies for each operation.
 *
 * Methods available:
 * - transferTransferCreate: POST /transfers
 * - transferTransferGet: GET /transfers/{id}
 * - quoteQuoteCreate: POST /quotes
 * - quoteQuoteGet: GET /quotes/{id}
 * - partyPartyGet: GET /parties/{type}/{id}
 */
export default handler(proxy => ({
    config: {
        api: {
            namespace: {
                fspiop: [
                    new URL('../../api/fspiop.yaml', import.meta.url).href,
                    new URL('../../api/fspiop.operations.yaml', import.meta.url).href,
                    {servers: [{url: 'http://localhost:4000'}]},
                ],
            },
        },
    },
    namespace: ['fspiop'],
}));
