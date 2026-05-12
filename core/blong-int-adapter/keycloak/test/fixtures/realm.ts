/**
 * Fixture data for Keycloak realm integration tests.
 * The `blong-integration` realm is pre-created by the init job; tests here
 * create and tear down a separate `blong-test-realm` to avoid interference.
 */

export const testRealm = {
    realm: 'blong-test-realm',
    displayName: 'Blong Test Realm',
    enabled: true,
} as const;

export const updatedRealm = {
    displayName: 'Blong Test Realm Updated',
} as const;
