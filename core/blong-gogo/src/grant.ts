/**
 * Short-lived grants: one signed token that asks for one capability, on one
 * request, for a few minutes.
 *
 * Troubleshooting a *running* system needs data that is far too expensive — or
 * too revealing — to produce for every request: the calls of a flow, the payloads
 * of a message, the debug records of a component. The alternative to always
 * collecting them is a switch that can be turned on for the next request, which
 * is what this is:
 *
 *     blong grant calls --ttl 15m
 *     curl -H 'x-blong-grant: <token>' ...
 *
 * - **Short-lived**: `exp` is enforced at verification, so a leaked token is
 *   worth a quarter of an hour, not a session.
 * - **One capability per token** (or a few, in `cap`), so granting one thing
 *   never implies another.
 * - **Signed with the gateway's own key** — the one it can verify with and a
 *   client cannot mint with. A deployment sets `GATEWAY_SIGN_KEY`; a checkout
 *   uses the committed development key, which is what makes the command work
 *   locally with no setup.
 *
 * The token is *not* forwarded: the gateway verifies it at its earliest hook and
 * republishes the answer as a plain capability marker in `$meta.forward`
 * (`callTrace.ts`), so a downstream process reads a decided capability instead of
 * a credential, and needs no key of its own. Capability #2 is added by naming it
 * in {@link Capability} and asking for it where its work happens — the transport,
 * the verification and the propagation are already shared.
 *
 * ## Failure is "no grant"
 *
 * An absent, malformed, expired or wrongly-signed token returns `undefined`
 * rather than throwing. These tokens arrive on a header anybody can set, so a
 * bad one is a request with no capabilities — never a rejected request. A
 * telemetry switch must not be able to fail the call it was meant to illuminate.
 */

import {importJWK, jwtVerify, SignJWT, type JWK} from 'jose';
import {CALLS_CAPABILITY} from './callTrace.ts';
import {devSignKey} from './devKeys.ts';

/** The capabilities a grant may ask for. One name per capability, never a wildcard. */
export type Capability = 'calls';

/** Every capability this build knows, so an unknown claim is dropped rather than trusted. */
const KNOWN: readonly Capability[] = ['calls'];

/** How a key is named to the framework. */
export type GrantKey = {env: string} | {generate: unknown} | JWK;

/** Fifteen minutes: long enough to reproduce a failure, short enough to forget. */
export const DEFAULT_TTL_SECONDS = 900;

/** The claims a grant carries. Nothing else is read back out of the token. */
export interface GrantClaims {
    cap: Capability[];
    /** Expiry, in seconds since the epoch, as JWT spells it. */
    exp?: number;
    iat?: number;
}

function isCapability(value: unknown): value is Capability {
    return typeof value === 'string' && (KNOWN as readonly string[]).includes(value);
}

/**
 * Resolve a key spec to a JWK.
 *
 * `{env}` exists so a deployment can keep the key material in its secret
 * configuration rather than in the merged config a `/api/sys/config` dump would
 * print; the literal `devSignKey` is what a checkout falls back to.
 */
function resolveKey(key: GrantKey | undefined): JWK | undefined {
    if (key === undefined) {
        return devSignKey as JWK;
    }
    if ('generate' in key) {
        // A generated key exists only in the process that made it: a gateway whose
        // keys were generated (no `GATEWAY_SIGN_KEY`, no configured key) verifies no
        // grant at all, and in particular does not fall back to the committed
        // development key and start accepting tokens anybody could mint.
        return undefined;
    }
    if ('env' in key) {
        const value = process.env[key.env];
        if (!value) return undefined;
        try {
            return JSON.parse(value) as JWK;
        } catch {
            throw new Error(`Grant key "${key.env}" is set but does not contain valid JSON`);
        }
    }
    return key;
}

/** The signing algorithm the JWK names, defaulting to the framework's own. */
function algorithmOf(jwk: JWK): string {
    return typeof jwk.alg === 'string' ? jwk.alg : 'ES384';
}

/** The public half of a JWK, which is all verification needs. */
function publicOf(jwk: JWK): JWK {
    const {d: _d, p: _p, q: _q, dp: _dp, dq: _dq, qi: _qi, ...rest} = jwk;
    return rest as JWK;
}

/**
 * Mint a grant for `cap`, good for `ttlSeconds`.
 *
 * Throws when the key has no private half: minting a token nobody can verify is
 * a worse answer than saying so, and reaching here without one means the
 * deployment's key is configured as public-only.
 */
export async function mintGrant({
    cap,
    ttlSeconds = DEFAULT_TTL_SECONDS,
    key,
}: {
    cap: Capability[];
    ttlSeconds?: number;
    key?: GrantKey;
}): Promise<string> {
    const jwk = resolveKey(key);
    if (!jwk) {
        throw new Error('No grant key is configured (set GATEWAY_SIGN_KEY or pass --key)');
    }
    if (jwk.d === undefined) {
        throw new Error('The grant key has no private half, so no grant can be minted with it');
    }
    const alg = algorithmOf(jwk);
    const signer = await importJWK(jwk, alg);
    return new SignJWT({cap})
        .setProtectedHeader({alg, ...(jwk.kid === undefined ? {} : {kid: jwk.kid})})
        .setIssuedAt()
        .setExpirationTime(`${ttlSeconds}s`)
        .sign(signer);
}

/**
 * Verify a grant and read its capabilities.
 *
 * `undefined` for anything that does not verify — absent, malformed, expired,
 * signed by another key, or naming a capability this build does not know. The
 * caller treats that as "no capabilities", never as an error.
 */
export async function verifyGrant(
    token: string | undefined,
    key?: GrantKey,
): Promise<GrantClaims | undefined> {
    if (typeof token !== 'string' || token.length === 0) return undefined;
    let jwk: JWK | undefined;
    try {
        jwk = resolveKey(key);
    } catch {
        return undefined;
    }
    if (!jwk || jwk.d === undefined) return undefined;
    try {
        const {payload} = await jwtVerify(token, await importJWK(publicOf(jwk), algorithmOf(jwk)));
        const cap = Array.isArray(payload.cap) ? payload.cap.filter(isCapability) : [];
        return {
            cap,
            exp: typeof payload.exp === 'number' ? payload.exp : undefined,
            iat: typeof payload.iat === 'number' ? payload.iat : undefined,
        };
    } catch {
        return undefined;
    }
}

/** True when `grant` asked for `capability`. */
export function granted(grant: GrantClaims | undefined, capability: Capability): boolean {
    return grant?.cap.includes(capability) === true;
}

/**
 * Where the gateway's verification key comes from.
 *
 * `gateway.grant.key` when a deployment names one, else the gateway's sign key
 * spec — the key the gateway already resolves for MLE, whose private half stays
 * on the server. Reading it here rather than in `Gateway.ts` keeps the two
 * callers (a running gateway and the CLI that mints for it) on one rule.
 */
export function grantKeyFrom(config: unknown): GrantKey | undefined {
    const grant = (config as {grant?: {key?: GrantKey}} | undefined)?.grant;
    if (grant?.key !== undefined) return grant.key;
    const sign = (config as {sign?: GrantKey} | undefined)?.sign;
    return sign === undefined ? undefined : sign;
}

/**
 * Whether a grant asks for a flow's calls.
 *
 * The whole of what the gateway's earliest hook asks a grant: verify it once, and
 * turn the answer into the capability the flow is served under. Named rather than
 * inlined there so the seam can be tested without an HTTP server — the token's
 * checks and the capability's name are what could drift, and neither needs a
 * request to prove.
 */
export async function grantedCalls(
    token: string | undefined,
    key: GrantKey | undefined,
): Promise<boolean> {
    return granted(await verifyGrant(token, key), CALLS_CAPABILITY);
}

/**
 * Read a duration the way a person writes one: `45`, `45s`, `15m`, `2h`.
 *
 * A bare number is seconds, which is the unit the token itself uses. Anything
 * else is refused rather than guessed at — a TTL that silently means minutes
 * where the operator meant hours is a grant that outlives the investigation it
 * was minted for.
 */
export function parseTtl(value: unknown): number {
    if (value === undefined) return DEFAULT_TTL_SECONDS;
    const text = String(value).trim();
    const match = /^(\d+)(s|m|h)?$/.exec(text);
    if (!match) {
        throw new Error(`Unrecognized --ttl "${text}": expected seconds, or a number with s/m/h`);
    }
    const amount = Number(match[1]);
    const unit = match[2] ?? 's';
    const seconds = unit === 'h' ? amount * 3600 : unit === 'm' ? amount * 60 : amount;
    if (seconds < 1)
        throw new Error(`Unrecognized --ttl "${text}": a grant must last at least a second`);
    return seconds;
}

/**
 * `blong grant <capability> [--ttl=15m] [--key=<jwk|ENV_VAR>]`.
 *
 * Prints the token on stdout — and nothing else, so it can be used in a shell
 * substitution — and exits non-zero with a reason on stderr when it cannot be
 * minted. It does not load a suite: minting is one signature over the key the
 * deployment already has, and a command that had to boot an application to
 * produce a token would be unusable exactly when it is wanted (a running
 * deployment whose behaviour is in question).
 */
export async function runGrantCommand(
    positionals: string[],
    flags: {ttl?: unknown; key?: unknown} | Record<string, unknown>,
): Promise<void> {
    const {ttl, key: keyFlag} = flags as {ttl?: unknown; key?: unknown};
    const requested = positionals.slice(1).filter(name => name.length > 0);
    const unknown = requested.filter(name => !isCapability(name));
    if (requested.length === 0 || unknown.length > 0) {
        throw new Error(
            `Usage: blong grant <capability> [--ttl=15m]\n` +
                `Known capabilities: ${KNOWN.join(', ')}`,
        );
    }
    const key = typeof keyFlag === 'string' ? parseKeyFlag(keyFlag) : undefined;
    const token = await mintGrant({
        cap: requested as Capability[],
        ttlSeconds: parseTtl(ttl),
        ...(key === undefined ? {} : {key}),
    });
    process.stdout.write(`${token}\n`);
}

/**
 * Read `--key`: either an env var name holding the JWK, or the JWK itself.
 *
 * The name is the form a deployment uses (`--key=GATEWAY_SIGN_KEY`, beside the
 * variable the gateway reads), and the literal is the form an operator uses when
 * the key is not in the environment they are minting from.
 */
function parseKeyFlag(value: string): GrantKey {
    const text = value.trim();
    if (text.startsWith('{')) return JSON.parse(text) as JWK;
    return {env: text};
}
