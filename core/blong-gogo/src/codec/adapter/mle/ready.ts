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
    // Shared by the loginTokenCreate / accessRegistrationAdd / loginTokenExchange request senders.
    const encryptPublic = async (params: {$http?: unknown}): Promise<{$http?: unknown}> => {
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

    async function refresh(this: {
        exec?(...params: unknown[]): Promise<unknown>;
        error?(error: unknown, $meta?: unknown): void;
    }): Promise<void> {
        const now = Date.now();
        if (token && tokenExpire < now) {
            if (refreshToken && refreshTokenExpire > now) {
                try {
                    pending =
                        pending ||
                        (this.exec!(
                            {
                                path: '/rpc/login/token',
                                method: 'POST',
                                form: {
                                    grant_type: 'refresh_token',
                                    refresh_token: refreshToken,
                                },
                            },
                            {},
                        ) as Promise<{body?: unknown}>);
                    const result = await pending!;
                    if (pending !== null) pending = null;
                    readToken(result.body as IToken);
                } catch (error) {
                    pending = null;
                    clearTokens();
                    this.error!(error);
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
    };
});
