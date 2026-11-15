import {createHmac, timingSafeEqual} from 'node:crypto';

/**
 * The scope cookie: what a caller may read, signed so a read needs no database.
 *
 * The value is `<payload>.<mac>`, base64url of a small JSON object and an HMAC-SHA256 over it. The
 * serving route verifies it in-process, which is the whole point of the design (@@D-836).
 */
export interface IBlobScopeToken {
    /** The actor the scopes were collected for. */
    actorId?: string;
    /** The tokens `blobScopeMatch` compares against a blob's own list. */
    scopes: string[];
    /** Expiry, seconds since the epoch. */
    exp: number;
}

const encode = (value: string | Buffer): string => Buffer.from(value).toString('base64url');

/** Sign a payload into the cookie's value. */
export function blobScopeSign(token: IBlobScopeToken, secret: string): string {
    const payload = encode(JSON.stringify(token));
    const mac = createHmac('sha256', secret).update(payload).digest('base64url');
    return `${payload}.${mac}`;
}

/**
 * Read a cookie's value back, or `null` when it is not one we signed or has expired.
 *
 * A refusal is `null` rather than a throw: the caller then holds no scopes, which is exactly what an
 * anonymous blob should still be readable with.
 */
export function blobScopeVerify(
    value: string | undefined,
    secret: string | undefined,
    now: number = Date.now(),
): IBlobScopeToken | null {
    if (!value || !secret) return null;
    const [payload, mac] = value.split('.');
    if (!payload || !mac) return null;
    const expected = createHmac('sha256', secret).update(payload).digest('base64url');
    const given = Buffer.from(mac);
    const wanted = Buffer.from(expected);
    if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return null;
    try {
        const token = JSON.parse(
            Buffer.from(payload, 'base64url').toString('utf8'),
        ) as IBlobScopeToken;
        if (!Array.isArray(token.scopes)) return null;
        if (typeof token.exp !== 'number' || token.exp * 1000 <= now) return null;
        return token;
    } catch {
        return null;
    }
}

/** The scope tokens a request carries, from the cookie named in the configuration. */
export function blobScopesFromRequest(
    $meta: unknown,
    cookieName: string,
    secret?: string,
): string[] {
    const cookies = ($meta as {httpRequest?: {state?: Record<string, string>}})?.httpRequest?.state;
    const token = blobScopeVerify(cookies?.[cookieName], secret);
    return token?.scopes ?? [];
}
