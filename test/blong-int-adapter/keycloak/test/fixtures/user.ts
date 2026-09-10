/**
 * Fixture data for Keycloak user integration tests.
 * All users are created inside the pre-existing `blong-integration` realm.
 */

export const testUser = {
    realm: 'blong-integration',
    username: 'blong-test-crud',
    email: 'blong-test-crud@test.com',
    firstName: 'Blong',
    lastName: 'Test',
    enabled: true,
    emailVerified: true,
} as const;

export const updatedUser = {
    firstName: 'Blong Updated',
    lastName: 'Test Updated',
} as const;

export const testPassword = 'blong-test-password-1' as const;
