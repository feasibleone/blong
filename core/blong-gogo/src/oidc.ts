import type {Errors} from '@feasibleone/blong';
import {createLocalJWKSet, decodeJwt, decodeProtectedHeader, jwtVerify} from 'jose';
import {requestGet as get, loginService} from './lib.ts';

export default ({
    issuers,
    tls = {},
    discoverService = false,
    session,
    errorPrefix,
    errors: {
        [`${errorPrefix}oidcEmpty`]: errorOidcEmpty,
        [`${errorPrefix}oidcHttp`]: errorOidcHttp,
        [`${errorPrefix}actionEmpty`]: errorActionEmpty,
        [`${errorPrefix}actionHttp`]: errorActionHttp,
        [`${errorPrefix}unauthorized`]: errorUnauthorized,
        [`${errorPrefix}oidcNoIssuer`]: errorNoIssuer,
        [`${errorPrefix}oidcNoKid`]: errorNoKid,
        [`${errorPrefix}oidcBadIssuer`]: errorBadIssuer,
        [`${errorPrefix}jwtInvalid`]: errorInvalid,
    },
}: {
    issuers: Record<
        string,
        {configuration?: string; url?: string; audience?: string; [key: string]: unknown} | false
    >;
    tls?: {
        rejectUnauthorized?: boolean;
        ca?: string | Buffer | Array<string | Buffer>;
        cert?: string | Buffer;
        key?: string | Buffer;
    };
    discoverService?: boolean;
    session?: (decoded: object) => Promise<void>;
    errorPrefix: string;
    errors: Errors<{
        [key: string]: unknown;
    }>;
}) => {
    async function openIdConfig(
        issuer: string,
        headers: Record<string, string | undefined> | undefined,
        protocol: string,
    ) {
        if (issuer === 'blong-login') {
            const {protocol: loginProtocol, hostname, port} = await loginService(discoverService);
            issuer = `${loginProtocol}://${hostname}:${port}/rpc/login/.well-known/openid-configuration`;
        } else {
            headers = undefined;
        }
        return await get(issuer, errorOidcHttp, errorOidcEmpty, headers, protocol, tls);
    }

    let actionsCache: Record<string, number[] | number>;
    async function actions(method: string) {
        if (actionsCache) return actionsCache[method];
        const {protocol, hostname, port} = await loginService(discoverService);
        const actionsMap = (await get(
            `${protocol}://${hostname}:${port}/rpc/login/action`,
            errorActionHttp,
            errorActionEmpty,
            {},
            undefined,
            tls,
        )) as Record<string, number>;
        const fuzzyMap = Object.entries(actionsMap).reduce(
            (all, [action, bit]) => {
                for (let i = 1, segments = action.split('.'), n = segments.length; i < n; i += 1) {
                    const key = segments.slice(0, i).concat('%').join('.');
                    if (!all[key]) all[key] = [];
                    all[key].push(bit);
                }
                return all;
            },
            {} as Record<string, number[]>,
        );

        actionsCache = {...fuzzyMap, ...actionsMap};

        return actionsCache[method];
    }

    function checkPermission(bit: number, map: number[]) {
        bit -= 1;
        const index = Math.floor(bit / 8);
        return Number.isInteger(index) && index < map.length && map[index] & (1 << (bit % 8));
    }

    async function checkAuthSingle(method: string, map: number[]) {
        if (Array.isArray(method)) {
            for (const m of method) {
                if (!(await checkAuthSingle(m, map))) return false;
            }
            return true;
        }
        const bit = await actions(method);
        return Array.isArray(bit)
            ? bit.some(b => checkPermission(b, map))
            : checkPermission(bit, map);
    }

    async function checkAuth(method: string, map: number[], dontThrow: boolean) {
        if (!(await checkAuthSingle(method, map)) && !(await checkAuthSingle('%', map))) {
            if (dontThrow) return false;
            throw errorUnauthorized({params: {method}});
        }
        return true;
    }

    const issuerUrl = (base: string, url: string) =>
        base === 'blong-login' ? 'blong-login' : new URL(url, base.replace(/\/?$/, '/')).href;

    const loadIssuers = () =>
        Promise.all(
            Object.entries(issuers)
                .filter(([, config]) => config)
                .map(
                    ([
                        issuerId,
                        {
                            configuration,
                            url = '.well-known/openid-configuration',
                            audience = 'blong',
                            ...rest
                        },
                    ]) =>
                        (async () => [
                            issuerId,
                            {
                                ...(await openIdConfig(configuration || issuerUrl(issuerId, url))),
                                audience,
                                issuerId,
                                ...rest,
                            },
                        ])(),
                ),
        );

    async function cache() {
        return (await loadIssuers()).reduce(
            (prev, [issuer, config]) => ({...prev, [config.issuer]: config, [issuer]: config}),
            {},
        );
    }

    const getIssuers = (headers: object, protocol: string) =>
        Promise.all(
            Object.entries(issuers)
                .filter(([, config]) => config)
                .map(([issuer, {configuration, url = '.well-known/openid-configuration'}]) =>
                    openIdConfig(configuration || issuerUrl(issuer, url), headers, protocol),
                ),
        );

    let issuersCache: Promise<Record<string, object>> | null = null;

    async function issuerConfig(issuerId: string): Promise<{
        issuer: string;
        jwks_uri: string;
        audience: string;
        [key: string]: unknown;
    }> {
        if (issuerId === 'blong-login') return openIdConfig('blong-login');
        issuersCache = issuersCache || cache();
        const result = (await issuersCache)[issuerId];
        if (!result) {
            throw errorBadIssuer({params: {issuerId}});
        }
        return result;
    }

    async function jwks(issuerId: string) {
        return get(
            (await issuerConfig(issuerId)).jwks_uri,
            errorOidcHttp,
            errorOidcEmpty,
            {},
            undefined,
            tls,
        );
    }

    const keys: Record<string, ReturnType<typeof createLocalJWKSet>> = {};

    async function getKey(decoded: {iss?: string}, protectedHeader: {kid?: string}) {
        const issuerId = decoded?.iss;
        if (!issuerId) throw errorNoIssuer();
        const kid = protectedHeader?.kid;
        if (!kid) throw errorNoKid();
        if (!keys[issuerId]) keys[issuerId] = createLocalJWKSet(await jwks(issuerId));
        const result = await keys[issuerId](protectedHeader, decoded);
        if (!result) throw errorInvalid({params: {message: 'Invalid OIDC key id'}});
        return result;
    }

    async function verify(
        token: string,
        {nonce, audience = 'blong'}: {nonce?: string; audience?: string},
        isId: boolean,
    ) {
        let decoded;
        let protectedHeader;
        try {
            decoded = decodeJwt(token);
            protectedHeader = decodeProtectedHeader(token);
        } catch (error) {
            throw errorInvalid({params: {message: error.message}, cause: error});
        }
        const config = (decoded.iss &&
            decoded.iss !== 'blong-login' &&
            (await issuerConfig(decoded.iss))) || {audience};
        try {
            if (isId) {
                await jwtVerify(token, await getKey(decoded, protectedHeader), {
                    audience: config.audience,
                    issuer: decoded.iss,
                    nonce,
                });
            } else {
                await jwtVerify(token, await getKey(decoded, protectedHeader), {
                    audience: config.audience,
                });
            }
        } catch (error) {
            throw errorInvalid({params: {message: (error as Error).message}, cause: error});
        }
        if (session && audience === 'blong' && !decoded.ses) await session(decoded);
        return {
            ...decoded,
            config,
        };
    }

    return {
        get: (
            url: string,
            errorHttp: (params: Record<string, unknown>) => unknown,
            errorEmpty: () => unknown,
            headers: Record<string, string | undefined> | undefined,
            protocol: string,
        ) => get(url, errorHttp, errorEmpty, headers, protocol, tls),
        verify,
        getIssuers,
        checkAuth,
        issuerConfig,
    };
};
