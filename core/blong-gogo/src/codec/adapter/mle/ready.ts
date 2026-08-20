import {handler} from '@feasibleone/blong/types';
import {type Response} from 'got';
import {exportJWK, generateKeyPair} from 'jose';
import joseFactory from '../../../jose.ts';

const isBrowser: boolean = typeof window !== 'undefined' && typeof window.document !== 'undefined';

const key = async (alg: string, options?: object): Promise<object> => ({
    alg,
    ...(await exportJWK((await generateKeyPair(alg, options)).privateKey)),
});

interface IToken {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    refresh_token_expires_in?: number;
}

export default handler<{
    token: unknown;
    tokenExpire: number;
}>(({config: {token, tokenExpire}}) => {
    let jose: Awaited<ReturnType<typeof joseFactory>> | undefined,
        serverKey: {encrypt: unknown; sign: unknown},
        pending: Promise<{body?: unknown}> | null,
        refreshToken: string | null,
        refreshTokenExpire: number;

    const encrypt = (msg: unknown, protectedHeader?: object): unknown => {
        return jose
            ? globalThis.window &&
              msg &&
              (msg as Record<string, unknown>).formData instanceof globalThis.window.FormData
                ? msg
                : jose.signEncrypt(
                      msg as object,
                      serverKey.encrypt as Parameters<typeof jose.signEncrypt>[1],
                      protectedHeader,
                  )
            : msg;
    };

    const decrypt = async (object: object, property: string): Promise<void> => {
        const rec = object as Record<string, unknown>;
        if (rec?.[property] && typeof rec[property] !== 'string') {
            if (
                typeof window === 'object' &&
                'result' in rec &&
                rec.result instanceof window.Blob
            ) {
                rec[property] = rec.result;
            } else if (jose) {
                const decrypted = await jose.decryptVerify(
                    rec[property] as Parameters<typeof jose.decryptVerify>[0],
                    serverKey.sign as Parameters<typeof jose.decryptVerify>[1],
                );
                if (rec) rec[property] = decrypted;
            }
        }
    };

    // Public (auth: 'login') endpoints — pre-auth callers hold no blong token, so the MLE
    // request is encrypted with the handshake keys carried in the JWE protected header.
    // Shared by the loginTokenCreate / accessRegistrationAdd / loginTokenExchange /
    // loginTokenRefresh / loginTokenRestore request senders.
    const encryptPublic = async (
        params: {$http?: unknown} & Record<string, unknown>,
    ): Promise<{$http?: unknown} & Record<string, unknown>> => {
        if (!jose) return params;
        const {$http, ...rest} = params;
        const encrypted = (await encrypt(rest, {
            mlsk: jose.keys.sign,
            mlek: jose.keys.encrypt,
        })) as typeof params;
        if ($http && encrypted) encrypted.$http = $http;
        return encrypted;
    };
    function readToken(where: IToken): void {
        tokenExpire = Date.now() + where.expires_in * 1000 - 5000; // let it refresh 5 seconds earlier
        token = where.access_token;
        if (where.refresh_token) {
            refreshToken = where.refresh_token;
            refreshTokenExpire = Date.now() + where.refresh_token_expires_in! * 1000 + 5000; // give it extra 5 seconds validity
        }
    }

    function clearTokens(): void {
        token = null;
        tokenExpire = 0;
        refreshToken = null;
        refreshTokenExpire = 0;
    }

    /**
     * Redeem a refresh token at `login.token.refresh` (auth: 'login' — MLE
     * handshake keys, plain JSON-RPC response).  On success the new access +
     * refresh tokens are stored in memory.  On refusal (revoked / inactive /
     * expired session) the tokens are cleared so the next request surfaces a
     * clean 401 to the caller, which the UI turns into a login prompt.
     */
    async function refresh(this: {
        exec?(...params: unknown[]): Promise<unknown>;
        error?(error: unknown, $meta?: unknown): void;
    }, opts: {force?: boolean} = {}): Promise<void> {
        const now = Date.now();
        if (token && (opts.force || tokenExpire < now)) {
            if (refreshToken && refreshTokenExpire > now) {
                try {
                    pending =
                        pending ||
                        (async () => {
                            const params = await encryptPublic({refreshToken});
                            const result = (await this.exec!(
                                {
                                    path: '/rpc/login/token/refresh',
                                    method: 'POST',
                                    responseType: 'json',
                                    json: {
                                        jsonrpc: '2.0',
                                        id: 1,
                                        method: 'login.token.refresh',
                                        params,
                                    },
                                },
                                {},
                            )) as {
                                statusCode?: number;
                                body?: {result?: IToken; error?: {type?: string; message?: string; statusCode?: number}};
                            };
                            return result;
                        })();
                    const result = await pending!;
                    if (pending !== null) pending = null;
                    const {body, statusCode} = result as {
                        statusCode?: number;
                        body?: {result?: IToken; error?: {type?: string; message?: string; statusCode?: number}};
                    };
                    // The gateway MLE-encrypts the response with the handshake
                    // keys, so decrypt the result before reading the token.
                    await decrypt(body as object, 'result');
                    if (body?.error || (statusCode != null && statusCode >= 400)) {
                        clearTokens();
                        const error = new Error(
                            body?.error?.message || 'Token refresh failed',
                        ) as Error & {
                            type?: string;
                            statusCode?: number;
                            auth?: boolean;
                        };
                        error.type = body?.error?.type || 'rpc.refreshFailed';
                        error.statusCode = body?.error?.statusCode ?? statusCode ?? 401;
                        error.auth = true;
                        throw error;
                    }
                    readToken(body!.result as IToken);
                } catch (error) {
                    pending = null;
                    // Keep auth-classified failures as-is; otherwise drop tokens
                    // so the next request reports a clean 401.
                    if (!(error as {auth?: boolean}).auth) clearTokens();
                    throw error;
                }
            } else clearTokens();
        }
    }

    return {
        async ready() {
            let mleKey = null; // isBrowser && JSON.parse(window.localStorage.getItem('mle-jose') || 'null');
            if (!mleKey) {
                const {body: {sign, encrypt} = {}}: {body?: {sign?: unknown; encrypt?: unknown}} =
                    (await (this as {exec?(...params: unknown[]): Promise<unknown>}).exec!(
                        {
                            method: 'GET',
                            responseType: 'json',
                            path: '/rpc/login/.well-known/mle',
                        },
                        {},
                    )) as {body?: {sign?: unknown; encrypt?: unknown}};
                if (sign && encrypt) {
                    const signKey = await key('ES384', {crv: 'P-384', extractable: true});
                    const encryptKey = await key('ECDH-ES+A256KW', {
                        crv: 'P-384',
                        extractable: true,
                    });
                    mleKey = {
                        serverKey: {sign, encrypt},
                        clientKey: {
                            sign: signKey,
                            encrypt: encryptKey,
                        },
                    };
                    if (isBrowser) window.localStorage.setItem('mle-jose', JSON.stringify(mleKey));
                }
            }
            if (mleKey) {
                if (isBrowser && (!window.crypto || !window.crypto.subtle)) {
                    const errorMessage =
                        window.location.protocol === 'https:'
                            ? "Your browser doesn't support SubtleCrypto interface of the Web Crypto API"
                            : 'SubtleCrypto interface of the Web Crypto API is available only in secure contexts (HTTPS) ';
                    window.alert(errorMessage);
                    throw new Error(errorMessage);
                }
                jose = await joseFactory(mleKey.clientKey);
                serverKey = mleKey.serverKey;
            }
        },
        async send(
            params: {
                $http?: {
                    url?: string;
                    method?: string;
                    headers?: {authorization?: string};
                    path?: unknown;
                };
            },
            $meta: unknown,
        ) {
            let {$http, ...rest} = params; // eslint-disable-line prefer-const
            params = (await encrypt(params instanceof Array ? params : rest)) as typeof params;
            await refresh.call(this);
            if (token) {
                $http = $http || {};
                if (!$http.headers) $http.headers = {};
                $http.headers.authorization = 'Bearer ' + token;
            }
            if ($http && params) params.$http = $http;
            // An unexpected 401 is surfaced as-is: the automatic pre-send
            // `refresh()` above already renewed the token when it was close to
            // expiry, so a 401 here means the session is genuinely unusable
            // (e.g. revoked/closed server-side) — a forced renewal would only
            // add a failing round-trip.  The UI turns the 401 into a login
            // prompt.
            return super.send(params, $meta);
        },
        async receive(
            result: Response<{
                jsonrpc?: string;
                error?: object;
                result?: object;
                validation?: unknown;
                debug?: unknown;
            }>,
            $meta: unknown,
        ) {
            await decrypt(result.body, 'error');
            await decrypt(result.body, 'result');
            this.log?.debug?.(
                {...(result.body?.error || result.body?.result), $meta},
                result.body?.error ? 'Received error response' : 'Received successful response',
            );
            return super.receive(result, $meta);
        },
        async errorReceive(result: Response, $meta: unknown) {
            if (result.statusCode === 401) token = null;
            await decrypt(result.body as object, 'error');
            return super.receive(result, $meta);
        },
        async loginTokenCreateRequestSend(params: {$http?: unknown}, $meta: unknown) {
            return super.send(await encryptPublic(params), $meta);
        },
        async loginTokenCreateResponseReceive(result: Response<{result: unknown}>, $meta: unknown) {
            await decrypt(result.body, 'result');
            if ((result.body as {error?: unknown})?.error) return super.receive(result, $meta);
            readToken(result.body.result as IToken);
            return super.receive(result, $meta);
        },
        // Explicit token renewal (auth: 'login') — the same path the automatic
        // `refresh()` uses; feeds the new tokens into memory.
        async loginTokenRefreshRequestSend(params: {$http?: unknown}, $meta: unknown) {
            return super.send(await encryptPublic(params), $meta);
        },
        async loginTokenRefreshResponseReceive(result: Response<{result: unknown}>, $meta: unknown) {
            await decrypt(result.body, 'result');
            if ((result.body as {error?: unknown})?.error) return super.receive(result, $meta);
            readToken(result.body.result as IToken);
            return super.receive(result, $meta);
        },
        // Public (auth: 'login') endpoints — see encryptPublic.
        async accessRegistrationAddRequestSend(params: {$http?: unknown}, $meta: unknown) {
            return super.send(await encryptPublic(params), $meta);
        },
        async loginTokenExchangeRequestSend(params: {$http?: unknown}, $meta: unknown) {
            return super.send(await encryptPublic(params), $meta);
        },
        // Session restore (auth: 'login') — exchanges the path-scoped HttpOnly
        // cookie for fresh tokens; the response feeds the same readToken path.
        async loginTokenRestoreRequestSend(params: {$http?: unknown}, $meta: unknown) {
            return super.send(await encryptPublic(params), $meta);
        },
        async loginTokenRestoreResponseReceive(result: Response<{result: unknown}>, $meta: unknown) {
            await decrypt(result.body, 'result');
            if ((result.body as {error?: unknown})?.error) return super.receive(result, $meta);
            readToken(result.body.result as IToken);
            return super.receive(result, $meta);
        },
    };
});
