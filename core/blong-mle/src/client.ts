/**
 * Self-contained MLE HTTP client for a Blong gateway.
 *
 * Handles the MLE bootstrap + login and exposes `call()` for authenticated RPC
 * calls — used by dev tooling (e.g. the `blong-dev proxy` command) that needs
 * to talk to a gateway over plain HTTP without re-implementing the codec.
 *
 * Wire protocol (mirrors `blong-gogo/src/busGateway.ts`):
 *  1. `GET /rpc/login/.well-known/mle` → server public sign/encrypt JWKs.
 *  2. `POST /rpc/login/identity/exchange` with the credentials encrypted to
 *     the server's public encrypt key + client handshake keys in the header →
 *     `{access_token, ..., sign, encrypt}` (per-session server keys).
 *  3. `POST /rpc/{subject}/{object}/{predicate}` with the params encrypted to
 *     the session encrypt key + `Authorization: Bearer <token>` → decrypt the
 *     `result` with the session sign key.
 */
import type {JWK} from 'jose';

import {createMleCrypto} from './crypto.ts';

export interface IMleClientOptions {
    /** Gateway base URL, e.g. `http://localhost:8080`. */
    url: string;
    /**
     * Optional credentials.  When provided the client auto-logs-in on
     * creation ("pre-authenticated" mode).  When omitted the client starts
     * unauthenticated and you must call `login(username, password)` (or
     * `setAuth()` with a captured login response) before authenticated calls
     * ("manual" mode).
     */
    username?: string;
    password?: string;
    channel?: string;
    /** Injectable fetch (defaults to global fetch). */
    fetchImpl?: typeof fetch;
}

export interface IMleCallOptions {
    /**
     * Use the handshake keys (pre-auth, e.g. `login.*` endpoints) instead of
     * the session keys, and omit the Authorization header.  Default false.
     */
    public?: boolean;
}

export interface IMleAuth {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    refresh_token_expires_in: number;
    sign?: JWK | string;
    encrypt?: JWK | string;
}

export interface IMleClient {
    /** Client public handshake keys (for debugging/logging). */
    keys: {sign: JWK; encrypt: JWK};
    /** The login response (token + per-session server keys), or null pre-login. */
    auth: IMleAuth | null;
    /**
     * Perform the MLE login (`login.token.create`) and store the session.
     * Safe to call repeatedly to refresh.
     */
    login(username: string, password: string): Promise<void>;
    /** Install an externally captured login response (e.g. from a manual login). */
    setAuth(auth: IMleAuth): void;
    /**
     * Perform an authenticated RPC call to `/rpc/<subject>/<object>/<predicate>`
     * and return the decrypted result.
     */
    call(method: string, params: unknown, options?: IMleCallOptions): Promise<unknown>;
}

const asJwk = (k: unknown): JWK | undefined => {
    if (k == null) return undefined;
    return typeof k === 'string' ? (JSON.parse(k) as JWK) : (k as JWK);
};

export async function createMleClient(options: IMleClientOptions): Promise<IMleClient> {
    const {url} = options;
    const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);

    const crypto = await createMleCrypto({
        sign: {generate: {alg: 'EdDSA', use: 'sig'}},
        encrypt: {generate: {alg: 'ECDH-ES+A256KW', crv: 'P-384', use: 'enc'}},
    });
    // Client public handshake keys go in the JWE protected header.
    const localKeys = {mlsk: crypto.keys.sign, mlek: crypto.keys.encrypt};

    // 1. Server public keys (MLE handshake).
    const keysRes = await fetchImpl(`${url}/rpc/login/.well-known/mle`);
    const remoteKeys = (await keysRes.json()) as {sign: JWK; encrypt: JWK};
    if (!remoteKeys.sign || !remoteKeys.encrypt) {
        throw new Error(
            `MLE handshake failed: no sign/encrypt keys at ${url}/rpc/login/.well-known/mle`,
        );
    }

    let auth: IMleAuth | null = null;

    // 2. Login — credentials encrypted to the server's public encrypt key
    //    (handshake keys in the header, no bearer).  `login.token.create`
    //    returns the JWT plus the server's per-session sign/encrypt keys.
    const doLogin = async (username: string, password: string): Promise<void> => {
        const loginBody = {
            jsonrpc: '2.0',
            method: 'login.token.create',
            id: 1,
            params: await crypto.signEncrypt(
                {username, password} as object,
                remoteKeys.encrypt,
                localKeys,
            ),
        };
        const loginRes = await fetchImpl(`${url}/rpc/login/token/create`, {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify(loginBody),
        });
        const loginJson = (await loginRes.json()) as {result?: unknown; error?: unknown};
        if (loginJson.error) {
            throw new Error(`MLE login failed: ${JSON.stringify(loginJson.error)}`);
        }
        auth = (await crypto.decryptVerify(
            loginJson.result as string,
            remoteKeys.sign,
        )) as IMleAuth;
    };

    if (options.username && options.password) await doLogin(options.username, options.password);

    // Per-session server keys from the login response (fall back to handshake keys).
    const sessionSign = () => asJwk(auth?.sign) ?? remoteKeys.sign;
    const sessionEncrypt = () => asJwk(auth?.encrypt) ?? remoteKeys.encrypt;

    return {
        keys: crypto.keys,
        get auth() {
            return auth;
        },
        async login(username, password) {
            await doLogin(username, password);
        },
        setAuth(value: IMleAuth) {
            auth = value;
        },
        async call(method, params, callOptions = {}): Promise<unknown> {
            if (!callOptions.public && !auth) {
                throw new Error(
                    'MLE client is not authenticated — create it with username/password or ' +
                        'call login(username, password) / setAuth(...) before authenticated calls',
                );
            }
            const useEncrypt = callOptions.public ? remoteKeys.encrypt : sessionEncrypt();
            const useSign = callOptions.public ? remoteKeys.sign : sessionSign();
            const rpcPath = `/rpc/${method.replace(/\./g, '/')}`;
            // JSON-RPC envelope with the MLE-encrypted params (the gateway
            // decrypts `body.params`; `jsonrpc`/`id`/`method` stay in the clear).
            const body = {
                jsonrpc: '2.0',
                id: 1,
                method,
                params: await crypto.signEncrypt(
                    params as object,
                    useEncrypt,
                    callOptions.public ? localKeys : undefined,
                ),
            };
            const headers: Record<string, string> = {'content-type': 'application/json'};
            if (!callOptions.public && auth) headers.authorization = 'Bearer ' + auth.access_token;
            const res = await fetchImpl(`${url}${rpcPath}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });
            const json = (await res.json()) as {result?: unknown; error?: unknown};
            if (json.error) {
                // Errors are also MLE-encrypted — decrypt (fall back to raw on failure).
                let err: {message?: string; print?: string} = {message: String(json.error)};
                try {
                    err = (await crypto.decryptVerify(json.error as string, useSign)) as {
                        message?: string;
                        print?: string;
                    };
                } catch {
                    // keep the raw error string as the message
                }
                throw new Error(err.print ?? err.message ?? JSON.stringify(json.error));
            }
            if (json.result === undefined) return undefined;
            return crypto.decryptVerify(json.result as string, useSign);
        },
    };
}
