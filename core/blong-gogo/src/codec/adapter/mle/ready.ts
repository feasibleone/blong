import {handler} from '@feasibleone/blong';
import {type Response} from 'got';
import {exportJWK, generateKeyPair} from 'jose';
import joseFactory from 'ut-bus/jose.js';

const isBrowser: boolean = typeof window !== 'undefined' && typeof window.document !== 'undefined';

const key = async (alg, options): Promise<object> => ({
    alg,
    ...(await exportJWK((await generateKeyPair(alg, options)).privateKey)),
});

interface IToken {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    refresh_token_expires_in?: number; // eslint-disable-line @typescript-eslint/naming-convention
}

export default handler<{
    token: unknown;
    tokenExpire: number;
}>(({config: {token, tokenExpire}}) => {
    let jose,
        serverKey: {encrypt: unknown; sign: unknown},
        pending: {body?: unknown},
        refreshToken: string,
        refreshTokenExpire: number;

    const encrypt = (msg, protectedHeader?): unknown => {
        return jose
            ? global.window && msg && msg.formData instanceof window.FormData
                ? msg
                : jose.signEncrypt(msg, serverKey.encrypt, protectedHeader)
            : msg;
    };

    const decrypt = async (object: object, property: string): Promise<void> => {
        if (object?.[property] && typeof object[property] !== 'string') {
            if (
                typeof window === 'object' &&
                'result' in object &&
                object.result instanceof window.Blob
            ) {
                object[property] = object.result;
            } else if (jose) {
                const decrypted = await jose.decryptVerify(object[property], serverKey.sign);
                if (object) object[property] = decrypted;
            }
        }
    };
    function readToken(where: IToken): void {
        tokenExpire = Date.now() + where.expires_in * 1000 - 5000; // let it refresh 5 seconds earlier
        token = where.access_token;
        if (where.refresh_token) {
            refreshToken = where.refresh_token;
            refreshTokenExpire = Date.now() + where.refresh_token_expires_in * 1000 + 5000; // give it extra 5 seconds validity
        }
    }

    function clearTokens(): void {
        token = null;
        tokenExpire = 0;
        refreshToken = null;
        refreshTokenExpire = 0;
    }

    async function refresh(): Promise<void> {
        const now = Date.now();
        if (token && tokenExpire < now) {
            if (refreshToken && refreshTokenExpire > now) {
                try {
                    pending =
                        pending ||
                        this.exec(
                            {
                                path: '/rpc/login/token',
                                method: 'POST',
                                form: {
                                    grant_type: 'refresh_token',
                                    refresh_token: refreshToken,
                                },
                            },
                            {}
                        );
                    const result = await pending;
                    if (pending !== null) pending = null;
                    readToken(result.body as IToken);
                } catch (error) {
                    pending = null;
                    clearTokens();
                    this.error(error);
                }
            } else clearTokens();
        }
    }

    return {
        async ready() {
            let mleKey = isBrowser && JSON.parse(window.localStorage.getItem('mle-jose'));
            if (!mleKey) {
                const {body: {sign, encrypt} = {}}: {body?: {sign?: unknown; encrypt?: unknown}} =
                    await this.exec(
                        {
                            method: 'GET',
                            responseType: 'json',
                            path: '/rpc/login/.well-known/mle',
                        },
                        {}
                    );
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
                    window.alert(errorMessage); // eslint-disable-line no-alert
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
            $meta: unknown
        ) {
            let {$http, ...rest} = params; // eslint-disable-line prefer-const
            params = await encrypt(params instanceof Array ? params : rest);
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
                error?: unknown;
                validation?: unknown;
                debug?: unknown;
            }>,
            $meta: unknown
        ) {
            await decrypt(result.body, 'error');
            await decrypt(result.body, 'result');
            return super.receive(result, $meta);
        },
        async errorReceive(result: Response, $meta: unknown) {
            if (result.statusCode === 401) token = null;
            await decrypt(result.body as object, 'error');
            return super.receive(result, $meta);
        },
        async loginTokenCreateRequestSend(params: {$http?: unknown}, $meta: unknown) {
            if (jose) {
                const {$http, ...rest} = params;
                params = await encrypt(
                    rest,
                    jose && {
                        mlsk: jose.keys.sign,
                        mlek: jose.keys.encrypt,
                    }
                );
                if ($http && params) params.$http = $http;
            }
            return super.send(params, $meta);
        },
        async loginTokenCreateResponseReceive(result: Response<{result: unknown}>, $meta: unknown) {
            await decrypt(result.body, 'result');
            readToken(result.body.result as IToken);
            return super.receive(result, $meta);
        },
    };
});
