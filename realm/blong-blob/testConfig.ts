/**
 * `testConfig.ts` — the values an integration run needs and a test must agree with.
 *
 * A run that stores a byte needs an encryption key, and a run that mints a cookie needs the secret
 * that signs it. Both are read from configuration, so a test that wants to present a valid cookie has
 * to sign it with the same one — and a literal in two files drifts the moment either changes. One
 * copy, imported by the entry point and by the test groups (@@D-839 @@D-836).
 */

/** 32 bytes, hex: what `aes-256-cbc` takes. */
export const BLOB_TEST_CRYPTO_KEY =
    '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';

/** The secret the run signs its read cookie with. */
export const BLOB_TEST_COOKIE_SECRET = 'blob-integration-cookie-secret';
