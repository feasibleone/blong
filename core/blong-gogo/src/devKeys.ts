/**
 * The framework's development-time gateway keys.
 *
 * Static, committed, and deliberately not secret: their job is that two
 * processes started from the same checkout agree on the same key material, so a
 * session survives a hot reload and a token minted by one command is the token a
 * running server accepts. A deployment supplies its own through
 * `GATEWAY_SIGN_KEY` / `GATEWAY_ENCRYPT_KEY` (see `Gateway.ts`), and this module
 * is never consulted when they are set.
 *
 * They live here rather than inline in the `dev` intent because more than the
 * loader needs them: `blong grant` mints a short-lived capability token with the
 * same sign key the gateway verifies with, and a token minted with a key nobody
 * else holds is a token that verifies nowhere.
 */

/* cSpell:disable */
/** The `dev` intent's sign key (`ES384`, private: minting happens here too). */
export const devSignKey = {
    kty: 'EC',
    crv: 'P-384',
    alg: 'ES384',
    use: 'sig',
    x: 'VlRkjgqRHJSk9WN8CaAqHn34BUMy9pgKQUAAW9MrOqh0yvCmJW7JTr6LUCbm9zfW',
    y: '8eYxbAZrv-HZEc4LSgdEHeSp21zO3D8KrynMcVcNAmZKTf3RMkbkh1B26lePHQNz',
    d: 'aj6BkYmpwkKRbmcO1LO6d__HX5bvkqcRjqadlX7plXlGfj1d42XiSUWa4c9xrxwt',
};
/** The `dev` intent's encrypt key (`ECDH-ES+A256KW`). */
export const devEncryptKey = {
    kty: 'EC',
    crv: 'P-384',
    alg: 'ECDH-ES+A256KW',
    use: 'enc',
    x: '86IBoWsatO3Vky9CRMxmuYcfYoTY1Yr0D1sJGDgLlREMjbL9cIOHcBQnEaW52QJV',
    y: 'fsKOmTuXaIRFXXteh7uU0Z8mncX4VsPhqaz9pMKMm8EktQlF7HBS_fYFdkLwqMMN',
    d: 'rBY50TZzjONw_oYzWPqaR3DdoFwO-F9sWcmkOltrJHYnfbnTojNImX2xN1DhhC5-',
};
/* cSpell:enable */
