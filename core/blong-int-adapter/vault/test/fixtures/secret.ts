/**
 * Fixture data for Vault integration tests.
 * Used by testVaultSecretCrud to seed and verify CRUD operations.
 * The Vault CI deployment uses KV v1 (dev mode with -dev-kv-v1).
 */

/** Namespace prefix for all test secrets, enabling isolated list and cleanup. */
export const SECRET_PREFIX = 'secret/blong-test/';

export const secrets = [
    {
        path: 'secret/blong-test/alpha',
        data: {blongKey: 'alpha-value', blongSource: 'blong-integration'},
    },
    {
        path: 'secret/blong-test/beta',
        data: {blongKey: 'beta-value', blongVersion: 1},
    },
] as const;

export const updatedSecret = {
    data: {blongKey: 'alpha-updated', blongSource: 'blong-integration-updated'},
} as const;
