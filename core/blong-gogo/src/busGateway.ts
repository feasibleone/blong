// const request = (process.type === 'renderer') ? require('ut-browser-request') : require('request');
// const [httpPost] = [request.post].map(require('util').promisify);
import type {Errors, IMeta, ITypedError} from '@feasibleone/blong';
import ky from 'ky';

const decode = (result: unknown, method: string, unpack: boolean) =>
    unpack ? result : [result, {method, mtid: 'response'}];

export default ({
    serverInfo,
    mleClient,
    errors,
    get,
}: {
    serverInfo: (key: 'protocol' | 'port') => string;
    mleClient: {
        keys: {sign?: string; encrypt?: string};
        signEncrypt: (
            params: unknown,
            encryptKey: string,
            localKeys?: {mlsk: string; mlek: string},
        ) => Promise<unknown>;
        decryptVerify: (result: unknown, signKey: string) => Promise<unknown>;
    };
    errors: Errors<{
        'bus.jsonRpcHttp': unknown;
        'bus.jsonRpcEmpty': unknown;
    }>;
    get: (
        url: string,
        httpErrorType: (params?: unknown, $meta?: IMeta) => ITypedError,
        emptyErrorType: (params?: unknown, $meta?: IMeta) => ITypedError,
    ) => Promise<{
        sign: string;
        encrypt: string;
    }>;
}) => {
    const localCache: Record<
        string,
        {
            auth: {
                access_token: string;
                refresh_token: string;
                expires_in: number;
                refresh_token_expires_in: number;
                sign?: string;
                encrypt?: string;
            };
            tokenInfo: {
                tokenExpire: number;
                refreshTokenExpire: number;
            };
            remoteKeys: {
                sign: string;
                encrypt: string;
            };
        }
    > = {};
    const localKeys =
        mleClient.keys.sign && mleClient.keys.encrypt
            ? {mlsk: mleClient.keys.sign, mlek: mleClient.keys.encrypt}
            : undefined;

    function tokenInfo(auth: {expires_in: number; refresh_token_expires_in: number}) {
        const now = Date.now() - 5000; // latency tolerance of 5 seconds
        return {
            tokenExpire: now + auth.expires_in * 1000,
            refreshTokenExpire: now + auth.refresh_token_expires_in * 1000,
        };
    }

    async function login(
        cache: (typeof localCache)[string],
        url: string,
        username?: string,
        password?: string,
        channel?: string,
    ) {
        const {sign, encrypt} = (localKeys && (cache.auth || cache.remoteKeys)) || {};
        if (sign && encrypt && localKeys) {
            const {result, error} = await ky
                .post<{result: unknown; error: unknown}>(`${url}/rpc/login/identity/exchange`, {
                    json: {
                        jsonrpc: '2.0',
                        method: 'login.identity.exchange',
                        id: 1,
                        params: await mleClient.signEncrypt(
                            {username, password, channel},
                            encrypt,
                            localKeys,
                        ),
                    },
                })
                .json();
            if (error) throw Object.assign(new Error(), await mleClient.decryptVerify(error, sign));
            else if (result)
                cache.auth = (await mleClient.decryptVerify(result, sign)) as {
                    access_token: string;
                    refresh_token: string;
                    expires_in: number;
                    refresh_token_expires_in: number;
                    sign?: string;
                    encrypt?: string;
                };
            else throw errors['bus.jsonRpcEmpty']();
        } else {
            const {result, error} = await ky
                .post<{result: unknown; error: unknown}>(`${url}/rpc/login/identity/check`, {
                    json: {
                        jsonrpc: '2.0',
                        method: 'login.identity.check',
                        id: 1,
                        params: {username, password, channel},
                    },
                })
                .json();
            if (error) throw Object.assign(new Error(), error);
            else if (result)
                cache.auth = result as {
                    access_token: string;
                    refresh_token: string;
                    expires_in: number;
                    refresh_token_expires_in: number;
                    sign?: string;
                    encrypt?: string;
                };
            else throw errors['bus.jsonRpcEmpty']();
        }
        cache.tokenInfo = tokenInfo(cache.auth);
    }

    return async function gateway({
        username,
        password,
        channel = 'web',
        protocol = serverInfo('protocol'),
        host: hostname = 'localhost',
        port = serverInfo('port'),
        url,
        auth,
        method,
    }: {
        username?: string;
        password?: string;
        channel?: string;
        protocol?: string;
        host?: string;
        port?: number | string;
        url?: string;
        tls?: boolean;
        auth?: {
            access_token: string;
            refresh_token: string;
            expires_in: number;
            refresh_token_expires_in: number;
            sign?: string;
            encrypt?: string;
        };
        encrypt?: boolean;
        method: string;
    }) {
        // don't put a default value for uri in arguments as it can be empty string or null
        if (url) {
            const parsed = new URL(url);
            hostname = parsed.hostname;
            port = parsed.port;
            protocol = parsed.protocol.split(':')[0];
            if (parsed.username) username = parsed.username;
            if (parsed.password) password = parsed.password;
        } else {
            protocol = protocol && protocol.split(':')[0];
            url = `${protocol}://${hostname}:${port}`;
        }

        const codec: {
            encode?: (params: unknown) => Promise<unknown> | unknown;
            decode?: (result: unknown, unpack: boolean) => Promise<unknown> | unknown;
            requestParams?: {
                protocol: string;
                hostname: string;
                port: number | string;
                path: string;
            };
        } = {
            requestParams: {
                protocol,
                hostname,
                port,
                path: `/rpc/${method.replace(/\./g, '/')}`,
            },
        };

        const cache = (localCache[url] = localCache[url] || {});

        if (localKeys && !cache.remoteKeys) {
            const body = await get(
                `${url}/rpc/login/.well-known/mle`,
                errors['bus.jsonRpcHttp'],
                errors['bus.jsonRpcEmpty'],
            );
            if (body.sign && body.encrypt) cache.remoteKeys = body;
        }

        if (auth) {
            cache.auth = auth;
            cache.tokenInfo = tokenInfo(auth);
        }

        if (!cache.auth && !(username && password)) {
            if (cache.remoteKeys) {
                codec.encode = async params => ({
                    params: await mleClient.signEncrypt(
                        params,
                        cache.remoteKeys.encrypt,
                        localKeys,
                    ),
                    method,
                });
                codec.decode = async (result, unpack) =>
                    decode(
                        await mleClient.decryptVerify(result, cache.remoteKeys.sign),
                        method,
                        unpack,
                    );
            } else {
                codec.encode = params => ({params, method});
                codec.decode = (result, unpack) => decode(result, method, unpack);
            }
            return codec;
        }

        if (!cache.auth) await login(cache, url, username, password, channel);

        const exp = Date.now();

        if (exp > cache.tokenInfo.tokenExpire) {
            if (exp > cache.tokenInfo.refreshTokenExpire) {
                await login(cache, url, username, password, channel);
            } else {
                const {body} = await ky
                    .post<{body: {expires_in: number; refresh_token_expires_in: number}}>(
                        `${url}/rpc/login/token`,
                        {
                            json: {
                                grant_type: 'refresh_token',
                                refresh_token: cache.auth.refresh_token,
                            },
                        },
                    )
                    .json();
                Object.assign(cache.auth, body);
                cache.tokenInfo = tokenInfo(body);
            }
        }

        if (cache.auth.sign && cache.auth.encrypt) {
            codec.encode = async params => ({
                params: await mleClient.signEncrypt(params, cache.auth.encrypt!),
                headers: {
                    authorization: 'Bearer ' + cache.auth.access_token,
                },
                method,
            });
            codec.decode = async (result, unpack) =>
                decode(await mleClient.decryptVerify(result, cache.auth.sign!), method, unpack);
        } else {
            codec.encode = params => ({
                params,
                headers: {
                    authorization: 'Bearer ' + cache.auth.access_token,
                },
                method,
            });
            codec.decode = (result, unpack) => decode(result, method, unpack);
        }

        return codec;
    };
};
