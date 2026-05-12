/**
 * Fixture data for Keycloak group integration tests.
 * All groups are created inside the pre-existing `blong-integration` realm.
 */

export const testGroup = {
    realm: 'blong-integration',
    name: 'blong-test-group',
} as const;

export const updatedGroup = {
    name: 'blong-test-group-updated',
} as const;
