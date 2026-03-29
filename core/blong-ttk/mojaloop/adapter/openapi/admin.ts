import { adapter } from '@feasibleone/blong';

/**
 * HTTP transport adapter for Mojaloop Admin API.
 *
 * Provides the HTTP client layer for the Admin API (participants, endpoints, limits).
 * The orchestrator.openapi layer loads the spec from the realm config and creates
 * handler proxies for each operation using semantic triple naming:
 *
 * - adminParticipantCreate: POST /participants
 * - adminParticipantGet:    GET /participants/{name}
 * - adminParticipantList:   GET /participants
 * - adminEndpointAdd:       POST /participants/{name}/endpoints
 * - adminLimitSet:          POST /participants/{name}/limits
 * - adminAccountCreate:     POST /participants/{name}/accounts
 * - adminPartyRegister:     POST /parties
 *
 * API namespace config (URLs, spec paths) is provided in realm.ts under
 * config.default.openapi.api.namespace.admin.
 */
export default adapter(() => ({
    extends: 'adapter.http' as const,
}));
