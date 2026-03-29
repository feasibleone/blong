import { adapter } from '@feasibleone/blong';

/**
 * HTTP transport adapter for Mojaloop FSPIOP API.
 *
 * Provides the HTTP client layer for the FSPIOP API (transfers, quotes, parties).
 * The orchestrator.openapi layer loads the spec from the realm config and creates
 * handler proxies for each operation using semantic triple naming:
 *
 * - transferTransferCreate: POST /transfers
 * - transferTransferGet:    GET /transfers/{id}
 * - quoteQuoteCreate:       POST /quotes
 * - quoteQuoteGet:          GET /quotes/{id}
 * - partyPartyGet:          GET /parties/{type}/{id}
 *
 * API namespace config (URLs, spec paths) is provided in realm.ts under
 * config.default.openapi.api.namespace.fspiop.
 */
export default adapter(() => ({
    extends: 'adapter.http' as const,
}));
