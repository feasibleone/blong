/**
 * Fixture data for Keycloak client integration tests.
 * All clients are created inside the pre-existing `blong-integration` realm.
 */

export const testClient = {
    realm: 'blong-integration',
    clientId: 'blong-test-crud-client',
    name: 'Blong Test CRUD Client',
    enabled: true,
    publicClient: false,
    protocol: 'openid-connect',
    directAccessGrantsEnabled: true,
    standardFlowEnabled: false,
    serviceAccountsEnabled: false,
} as const;

export const updatedClient = {
    name: 'Blong Test CRUD Client Updated',
} as const;
