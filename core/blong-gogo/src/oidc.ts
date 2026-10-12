import type {Errors} from '@feasibleone/blong';
import {createLocalJWKSet, decodeJwt, decodeProtectedHeader, jwtVerify} from 'jose';
import {readFileSync} from 'node:fs';
import {requestGet as get, loginService} from './lib.ts';

/**
 * The headers an issuer's own endpoints are read with.
 *
 * A cluster's discovery document and key set are not anonymous: the API server answers 401 unless
 * the caller presents an identity it knows, so an issuer that names its credentials by file is read
 * with them (`rpc.oidcHttp: OpenID returned HTTP error 401` is what an uncredentialed read looks
 * like). The file is read per fetch rather than cached, because what lives in a projected
 * service-account volume is rotated by the kubelet and the process is meant to pick the new one up.
 */
const issuerHeaders = (config: {tokenFile?: string} | undefined): Record<string, string> => {
    if (!config?.tokenFile) return {};
    return {authorization: `Bearer ${readFileSync(config.tokenFile, 'utf8').trim()}`};
};

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
    discoverService?:
        | boolean
        | ((service: string) => Promise<{protocol: string; hostname: string; port: number}>);
    session?: (decoded: object) => Promise<void>;
    errorPrefix: string;
    errors: Errors<{
        [key: string]: unknown;
    }>;
}) => {
    async function openIdConfig(
        issuer: string,
        headers?: Record<string, string | undefined> | undefined,
        protocol?: string,
    ) {
        if (issuer === 'blong-login') {
            const {
                protocol: loginProtocol,
                hostname,
                port,
            } = await loginService(
                discoverService as unknown as (
                    service: string,
                ) => Promise<{protocol: string; hostname: string; port: number}>,
            );
            issuer = `${loginProtocol}://${hostname}:${port}/rpc/login/.well-known/openid-configuration`;
        }
        // The headers are kept for every issuer, not only for `blong-login`. A configured issuer
        // is read with whatever the caller of this function brought, and for a cluster issuer that
        // is the process's own credential: discarding it here turned the API server's answer into
        // `rpc.oidcHttp: 401` for a request that presented nothing, with nothing in the message to
        // say the credential had been dropped on the way (F-494).
        return await get(issuer, errorOidcHttp, errorOidcEmpty, headers, protocol ?? '', tls);
    }

    let actionsCache: Record<string, number[] | number>;
    async function actions(method: string) {
        if (actionsCache) return actionsCache[method];
        const {protocol, hostname, port} = await loginService(
            discoverService as unknown as (
                service: string,
            ) => Promise<{protocol: string; hostname: string; port: number}>,
        );
        const actionsMap = (await get(
            `${protocol}://${hostname}:${port}/rpc/login/action`,
            errorActionHttp,
            errorActionEmpty,
            {},
            protocol,
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
                .filter(
                    (
                        entry,
                    ): entry is [
                        string,
                        {
                            configuration?: string;
                            url?: string;
                            audience?: string;
                            [key: string]: unknown;
                        },
                    ] => !!entry[1],
                )
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
                                ...((await openIdConfig(
                                    configuration || issuerUrl(issuerId, url),
                                    issuerHeaders(rest as {tokenFile?: string}),
                                )) as object),
                                audience,
                                issuerId,
                                ...rest,
                            },
                        ])(),
                ),
        );

    async function cache() {
        return (await loadIssuers()).reduce(
            (prev, [issuer, config]) => {
                const key = (config as {issuer?: string}).issuer;
                return {...prev, ...(key ? {[key]: config} : {}), [issuer as string]: config};
            },
            {} as Record<string, unknown>,
        );
    }

    const getIssuers = (headers: object, protocol: string) =>
        Promise.all(
            Object.entries(issuers)
                .filter(
                    (
                        entry,
                    ): entry is [
                        string,
                        {configuration?: string; url?: string; [key: string]: unknown},
                    ] => !!entry[1],
                )
                .map(([issuer, {configuration, url = '.well-known/openid-configuration'}]) =>
                    openIdConfig(
                        configuration || issuerUrl(issuer, url),
                        headers as Record<string, string | undefined>,
                        protocol,
                    ),
                ),
        );

    let issuersCache: Promise<Record<string, unknown>> | null = null;

    async function issuerConfig(issuerId: string): Promise<{
        issuer: string;
        jwks_uri: string;
        audience: string;
        [key: string]: unknown;
    }> {
        if (issuerId === 'blong-login')
            return openIdConfig('blong-login') as unknown as {
                issuer: string;
                jwks_uri: string;
                audience: string;
                [key: string]: unknown;
            };
        issuersCache = issuersCache ?? cache();
        const result = (await issuersCache)[issuerId] as
            | {issuer: string; jwks_uri: string; audience: string; [key: string]: unknown}
            | undefined;
        if (!result) {
            throw errorBadIssuer({params: {issuerId}});
        }
        return result;
    }

    async function jwks(issuerId: string) {
        const config = await issuerConfig(issuerId);
        return get(
            config.jwks_uri,
            errorOidcHttp,
            errorOidcEmpty,
            issuerHeaders(config as {tokenFile?: string}),
            '',
            tls,
        );
    }

    const keys: Record<string, ReturnType<typeof createLocalJWKSet>> = {};

    async function getKey(decoded: {iss?: string}, protectedHeader: {kid?: string}) {
        const issuerId = decoded?.iss;
        if (!issuerId) throw errorNoIssuer();
        const kid = protectedHeader?.kid;
        if (!kid) throw errorNoKid();
        if (!keys[issuerId])
            keys[issuerId] = createLocalJWKSet(
                (await jwks(issuerId)) as Parameters<typeof createLocalJWKSet>[0],
            );
        const result = await keys[issuerId](
            protectedHeader as Parameters<(typeof keys)[string]>[0],
            decoded as Parameters<(typeof keys)[string]>[1],
        );
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
            throw errorInvalid({
                params: {message: (error as Error).message},
                cause: error as Error,
            });
        }
        const config = (decoded.iss &&
            decoded.iss !== 'blong-login' &&
            (await issuerConfig(decoded.iss))) || {audience};
        try {
            if (isId) {
                await jwtVerify(
                    token,
                    (await getKey(decoded, protectedHeader)) as unknown as Parameters<
                        typeof jwtVerify
                    >[1],
                    {
                        audience: (config as {audience?: string}).audience ?? audience,
                        issuer: decoded.iss as string,
                        ...(nonce ? {nonce} : {}),
                    } as Parameters<typeof jwtVerify>[2],
                );
            } else {
                await jwtVerify(
                    token,
                    (await getKey(decoded, protectedHeader)) as unknown as Parameters<
                        typeof jwtVerify
                    >[1],
                    {
                        audience: (config as {audience?: string}).audience,
                    },
                );
            }
        } catch (error) {
            throw errorInvalid({params: {message: (error as Error).message}, cause: error});
        }
        /**
         * The session step, for the issuers that ask for one.
         *
         * It is what hands a caller its session — an actor, a session id and the MLE key pair its
         * later calls are decrypted with — by asking the `identity` namespace, and the framework's
         * own issuer asks for it by name. An issuer may ask too (`session: true`), which is how a
         * realm that answers its own login keeps the framework's session contract without running
         * the framework's login realm: it answers `identity.checkInternal` itself. An issuer that
         * asks for nothing gets nothing — a cluster issuer answers for the caller by its signature
         * alone — and asking an `identity` service that does not exist is what made a verified
         * token fail with `ENOTFOUND identity.<namespace>.svc.cluster.local` (F-494).
         */
        const wantsSession =
            (config as {session?: boolean})?.session ?? decoded.iss === 'blong-login';
        if (session && wantsSession && !decoded.ses) await session(decoded);
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
