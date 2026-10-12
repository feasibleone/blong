/**
 * The session token this realm mints at login, and the key material it is signed with.
 *
 * Why a token at all: the framework reads the MLE key pair a caller's calls are signed with out of the
 * *token* — the `enc` and `sig` claims — and a Kubernetes service-account token cannot carry claims,
 * because the API server signs it. The realm therefore kept the pair beside the identity it verified
 * (`mleHandshake.ts`), keyed by that identity — and an identity is a service account, which every
 * browser presenting the same token shares. The second login overwrote the first browser's keys, and
 * the first browser's next call was refused as `Decryption failed` with
 * `ERR_JWS_SIGNATURE_VERIFICATION_FAILED` three steps from the cause (F-500). The pair belongs in the
 * token, where each login puts its own, and the key the pair is kept under is then a claim *inside*
 * the token the login created — its `sub`, the name the caller logged in as.
 *
 * Why it is signed here rather than by `jose`: the realm has no dependency of its own
 * (`kustomizeGatewayKeysEnsure` says why) and this is one algorithm on one key — a P-384 ECDSA over
 * the P-384 pair the realm generates. `dsaEncoding: 'ieee-p1363'` is the one detail that matters: JWS
 * carries the raw `R || S`, which node spells that way, while node's default is the DER shape no JWS
 * verifier accepts.
 */
import {createHash, createPrivateKey, createSign, type JsonWebKey} from 'node:crypto';

/** The algorithm the realm's own signing pair is generated with, and the only one this signs. */
export const SESSION_ALG = 'ES384';

/** The digest JWS pairs with `ES384`. */
const SESSION_DIGEST = 'sha384';

/** The private members of a JWK: RSA's primes, EC's scalar, an octet key and its other primes. */
const PRIVATE_MEMBERS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'k', 'oth'];

/** The public half of a JWK, which is all a key set may publish. */
export const publicSessionJwk = (jwk: JsonWebKey): JsonWebKey =>
    Object.fromEntries(
        Object.entries(jwk).filter(([name]) => !PRIVATE_MEMBERS.includes(name)),
    ) as JsonWebKey;

/**
 * The `kid` the token and the key set agree on.
 *
 * Derived from the public half rather than stored: the realm's generated pair carries no `kid`, and a
 * name that did not follow the key would let a verifier pick the wrong one out of a key set after a
 * rotation. Short, because it is a name, not a digest anyone verifies.
 */
export const sessionKeyId = (jwk: JsonWebKey): string =>
    createHash('sha256')
        .update(`${String(jwk.x ?? '')}.${String(jwk.y ?? '')}`)
        .digest('base64url')
        .slice(0, 16);

/**
 * The entry a key set publishes: the public half, named by the id a token's header carries.
 *
 * The pair the realm generates carries no `kid` — nothing had to name it before there was a key set
 * to look it up in — so the name is added here. Both sides read it from {@link sessionKeyId}, which
 * is what makes a verifier pick the key the token was signed with out of the set rather than refuse
 * the token for naming a key it cannot find.
 */
export const sessionPublicKey = (jwk: JsonWebKey): JsonWebKey => ({
    ...publicSessionJwk(jwk),
    kid: sessionKeyId(jwk),
});

/** What a session token says; every claim the framework reads is named here. */
export interface ISessionClaims {
    /** `sub`: the name the caller logged in as — the fictional username, not the cluster's. */
    username: string;
    /** `iss`: the issuer, which is also the entry the gateway verifies the token against. */
    issuer: string;
    /** `aud`: the audience that issuer expects. */
    audience: string;
    /** Seconds the token lives. */
    expiresIn: number;
    /** `ses`: the session id. Present, so the framework skips its own session step. */
    sessionId: string;
    /** `per`: the permission map. Empty here, because authorisation here is the cluster's. */
    permissionMap: string;
    /** The cluster identity the bearer was verified as, for attribution in a log or a status. */
    clusterUser?: string;
    /** `enc`: the caller's public encrypt JWK — what its answers are encrypted to. */
    mlek?: object;
    /** `sig`: the caller's public sign JWK — what its calls are verified with. */
    mlsk?: object;
}

const base64url = (value: object): string =>
    Buffer.from(JSON.stringify(value)).toString('base64url');

/**
 * Sign one session token: the compact JWS, header first.
 *
 * A wrong algorithm is refused rather than signed with the wrong digest: the key names its algorithm
 * (`ES384` for the pair the realm generates, `EdDSA` for the framework's committed development key)
 * and a token signed under a digest its `alg` does not name verifies nowhere.
 */
export const signSessionToken = (jwk: JsonWebKey, claims: ISessionClaims): string => {
    const alg = typeof jwk.alg === 'string' ? jwk.alg : SESSION_ALG;
    if (alg !== SESSION_ALG) throw new Error(`the session key signs ${alg}, not ${SESSION_ALG}`);
    const issuedAt = Math.floor(Date.now() / 1000);
    const data = `${base64url({alg, kid: sessionKeyId(jwk), typ: 'JWT'})}.${base64url({
        iss: claims.issuer,
        aud: claims.audience,
        sub: claims.username,
        ses: claims.sessionId,
        per: claims.permissionMap,
        typ: 'Bearer',
        ...(claims.clusterUser ? {clusterUser: claims.clusterUser} : {}),
        ...(claims.mlek ? {enc: claims.mlek} : {}),
        ...(claims.mlsk ? {sig: claims.mlsk} : {}),
        iat: issuedAt,
        exp: issuedAt + claims.expiresIn,
    })}`;
    return `${data}.${createSign(SESSION_DIGEST)
        .update(data)
        .sign({key: createPrivateKey({key: jwk, format: 'jwk'}), dsaEncoding: 'ieee-p1363'})
        .toString('base64url')}`;
};
