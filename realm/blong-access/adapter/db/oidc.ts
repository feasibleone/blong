import crypto from 'node:crypto';

export type IJwk = {
    kid?: string;
    alg?: string;
    kty?: string;
    n?: string;
    e?: string;
    use?: string;
};

/** Fields of an OIDC discovery document (`.well-known/openid-configuration`) used by the flow. */
export interface IOidcConfiguration {
    issuer?: string;
    authorization_endpoint?: string;
    token_endpoint?: string;
    userinfo_endpoint?: string;
    jwks_uri?: string;
}

/**
 * Fetch the OIDC discovery document for a provider (best-effort).
 *
 * Returns `undefined` when the provider has no discovery document or it cannot be
 * reached, letting callers fall back to hardcoded endpoints.  All endpoints come
 * back as absolute URLs per the OIDC spec.
 */
export async function discoverOidcConfiguration(
    discoveryUrl: string,
): Promise<IOidcConfiguration | undefined> {
    try {
        const res = await fetch(discoveryUrl, {headers: {accept: 'application/json'}});
        if (!res.ok) return undefined;
        return (await res.json()) as IOidcConfiguration;
    } catch {
        return undefined;
    }
}

/**
 * Fetch the OIDC UserInfo claims for an access token (best-effort).
 *
 * Returns `undefined` when the request fails so callers can fall back to the ID-token
 * claims.  The returned object contains standardized claims (sub, name, given_name,
 * family_name, email, email_verified, picture, ...).
 */
export async function fetchUserInfo(
    userinfoEndpoint: string,
    accessToken: string,
): Promise<Record<string, unknown> | undefined> {
    try {
        const res = await fetch(userinfoEndpoint, {
            headers: {authorization: `Bearer ${accessToken}`},
        });
        if (!res.ok) return undefined;
        return (await res.json()) as Record<string, unknown>;
    } catch {
        return undefined;
    }
}

/**
 * Verify a Google ID token (JWT) signature against a JWKS and return its
 * decoded claims.  Uses node:crypto only (RS256 — Google's standard signing
 * algorithm).  Throws on malformed tokens, unknown keys, bad signatures or
 * audience mismatch.
 */
export function verifyIdToken(
    token: string,
    jwks: {keys?: IJwk[]},
    audience: string,
): Record<string, unknown> {
        const [headerB64, payloadB64, signatureB64] = token.split('.');
        if (!headerB64 || !payloadB64 || !signatureB64) {
            throw new Error('Invalid ID token format');
        }

        const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')) as {
            kid?: string;
            alg?: string;
        };
        const payload = JSON.parse(
            Buffer.from(payloadB64, 'base64url').toString('utf8'),
        ) as Record<string, unknown>;
        const signature = Buffer.from(signatureB64, 'base64url');
        const data = Buffer.from(`${headerB64}.${payloadB64}`, 'utf8');

        if (header.alg !== 'RS256') {
            throw new Error(`Unsupported ID token algorithm: ${header.alg}`);
        }
        const key = (jwks?.keys ?? []).find(k => k.kid === header.kid);
        if (!key || key.kty !== 'RSA' || !key.n || !key.e) {
            throw new Error('No matching RSA signing key in JWKS');
        }

        const publicKey = crypto.createPublicKey({
            key: {kty: key.kty, n: key.n, e: key.e},
            format: 'jwk',
        });
        const verified = crypto.verify('sha256', data, publicKey, signature);
        if (!verified) {
            throw new Error('ID token signature verification failed');
        }

        if (payload.aud && String(payload.aud) !== audience) {
            throw new Error('ID token audience mismatch');
        }

        return payload;
}
