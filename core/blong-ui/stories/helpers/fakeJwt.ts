/**
 * Fake JWT helper for Storybook stories.
 * Generates unsigned JWTs for testing permission-gated components.
 * NOT for production use — no cryptographic signature.
 */

function toBase64Url(str: string): string {
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Generate a fake JWT with the given permissions.
 * The token has a valid 3-part structure that can be decoded by usePermissions,
 * but is not cryptographically signed.
 *
 * @param permissions - Permission strings to embed in the token.
 * @param sub - Subject (user ID).
 * @param expiresIn - Token lifetime in seconds (default: 3600). Pass a negative
 *   value to generate an already-expired token for testing expiry scenarios.
 */
export function fakeJwt(permissions: string[], sub = 'test-user', expiresIn = 3600): string {
    const header = toBase64Url(JSON.stringify({alg: 'HS256', typ: 'JWT'}));
    const payload = toBase64Url(
        JSON.stringify({
            sub,
            permissions,
            exp: Math.floor(Date.now() / 1000) + expiresIn,
            iat: Math.floor(Date.now() / 1000),
        }),
    );
    return `${header}.${payload}.fakesig`;
}
