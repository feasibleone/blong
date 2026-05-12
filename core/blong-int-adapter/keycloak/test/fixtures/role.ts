/**
 * Fixture data for Keycloak role integration tests.
 * All roles are created inside the pre-existing `blong-integration` realm.
 */

export const testRole = {
    realm: 'blong-integration',
    roleName: 'blong-test-role',
    description: 'Blong integration test role',
} as const;

export const updatedRole = {
    description: 'Updated description for blong test role',
} as const;
