import type {IMeta} from '@feasibleone/blong/types';
import got, {type HTTPAlias, type Headers} from 'got';
import type {JWTPayload} from 'jose';
import busGateway from './busGateway.ts';
import jose from './jose.ts';
import oidc from './oidc.ts';

import type {IResolution} from './Resolution.ts';
import tls from './tls.ts';

type Protocol = 'http' | 'https';
export interface IGatewayCodec {
    gateway: ($meta: object, methodName: string) => object | void;
    codec: (
        $meta: object,
        methodType: 'request' | 'publish',
    ) => Promise<{
        encode: (...params: unknown[]) => Promise<{
            params: object;
            headers?: object;
            method?: string;
        }>;
        decode: (result: unknown, unpack?: boolean) => Promise<unknown>;
        requestParams: {
            protocol: Protocol;
            hostname: string;
            port: string;
            path: string;
            cache?: string;
            namespace?: string;
        };
    }>;
    verify: (
        token: string,
        flags: {nonce?: string; audience: string},
        isId?: boolean,
    ) => Promise<JWTPayload & {per?: string}>;
}

export interface IConfig {
    client?: {tls?: {ca?: string | string[]; key?: string; cert?: string; crl?: string}};
    gateway?: object;
    protocol?: Protocol;
    host?: string;
    port?: string;
    service?: string;
    openId?: unknown;
    blongLogin?: unknown;
}

type Sender = (a: unknown, b: unknown) => Promise<unknown>;

export default class GatewayCodecImpl implements IGatewayCodec {
    #gatewayCodec: Promise<ReturnType<typeof busGateway>>;
    #protocol: Protocol;
    #port: string;
    #config: IConfig;
    #tlsClient: object;
    #resolution: IResolution;

    public verify!: IGatewayCodec['verify'];

    public constructor(
        config: IConfig,
        protocol: Protocol,
        port: string,
        errors: unknown,
        sender: Sender,
        resolution: IResolution,
    ) {
        this.#config = config;
        this.#protocol = protocol;
        this.#port = port;
        this.#tlsClient = tls(this.#config.client ?? {}, true) as object;
        this.#resolution = resolution;

        async function session(token: {
            oid?: string;
            sub?: string;
            per?: string;
            ses?: string;
            enc?: object;
            sig?: object;
        }): Promise<void> {
            const result = (await sender(
                {
                    username: token.oid || token.sub,
                    installationId: token.oid || token.sub,
                    type: 'oidc',
                    password: '*',
                    channel: 'web',
                },
                {method: 'identity.checkInternal'},
            )) as [
                {
                    'identity.check': {
                        actorId: unknown;
                        sessionId: string;
                    };
                    permissionMap: string;
                    mle?: {
                        mlek: string;
                        mlsk: string;
                    };
                },
            ];
            const [
                {
                    'identity.check': {actorId, sessionId},
                    permissionMap,
                    mle,
                },
            ] = result;
            if (token) {
                token.per = permissionMap;
                token.ses = sessionId;
                if (mle && mle.mlek) token.enc = JSON.parse(mle.mlek);
                if (mle && mle.mlsk) token.sig = JSON.parse(mle.mlsk);
                token.sub = String(actorId);
            }
        }

        const {verify, get} = oidc({
            async request(
                {
                    json,
                    method,
                    url,
                    headers,
                }: {
                    json: unknown;
                    method: HTTPAlias;
                    url: string;
                    headers: Headers;
                },
                callback: (error: Error, response?: unknown, body?: unknown) => void,
            ) {
                try {
                    const response = await got(url, {
                        method,
                        headers,
                        responseType: json ? 'json' : undefined,
                    });
                    if (response.request) Object.assign(response.request, {method, href: url});
                    callback(null as unknown as Error, response, response.body);
                } catch (error) {
                    callback(error as Error);
                }
            },
            discoverService: this._discoverService.bind(this) as unknown as boolean,
            errorPrefix: 'rpc.',
            errors: errors as never,
            session,
            tls: this.#tlsClient,
            issuers: (config.openId || {
                ...(config.blongLogin !== false && {'blong-login': {audience: 'blong'}}),
            }) as unknown as Record<string, false | {[key: string]: unknown}>,
        } as unknown as Parameters<typeof oidc>[0]);

        this.#gatewayCodec = (async () => {
            const mleClient = await jose((config.client || {}) as Parameters<typeof jose>[0]);
            return busGateway({
                errorPrefix: 'rpc.',
                serverInfo: (key: 'protocol' | 'port') => ({protocol, port})[key],
                mleClient: mleClient as never,
                errors: errors as never,
                get: get as never,
            } as never) as unknown as ReturnType<typeof busGateway>;
        })();

        this.verify = verify as unknown as IGatewayCodec['verify'];
    }

    public gateway($meta: IMeta, methodName: string = $meta.method!): object | void {
        if (this.#config.gateway && methodName !== 'identity.checkInternal') {
            const gw = this.#config.gateway as Record<string, unknown>;
            const [prefix, method] = methodName.split('/');
            if (method) {
                if (gw[prefix]) return {...(gw[prefix] as object), ...$meta.gateway, method};
            } else {
                const [namespace] = prefix.split('.');
                const gwEntry = gw[namespace] || gw[prefix];
                if (gwEntry) return {...(gwEntry as object), ...$meta.gateway, method: prefix};
            }
        }

        if ($meta.gateway) return {...$meta.gateway, method: methodName};
    }

    public async codec(
        $meta: IMeta,
        methodType: 'request' | 'publish',
    ): ReturnType<IGatewayCodec['codec']> {
        const gatewayConfig = this.gateway($meta);

        if (gatewayConfig)
            return (await this.#gatewayCodec)(gatewayConfig as never) as unknown as Awaited<
                ReturnType<IGatewayCodec['codec']>
            >;

        const [namespace, event] = $meta.method!.split('.');

        const op = ['start', 'stop', 'drain'].includes(event) ? event : methodType;

        return {
            encode: async (...params) => ({params}),
            decode: async result => result,
            requestParams: {
                ...(await this._discoverService('rpc-' + namespace)),
                path: `/rpc/ports/${namespace}/${op}`,
            },
        };
    }

    private async _discoverService(namespace: string): Promise<{
        protocol: Protocol;
        hostname: string;
        port: string;
        service: string;
    }> {
        const serviceName = namespace.replace(/\//g, '-');
        const params = {
            protocol: this.#config.protocol || this.#protocol,
            hostname: this.#config.host || serviceName,
            port: this.#config.port || this.#port,
            service: this.#config.service!,
        };
        const requestParams = Object.assign({}, params);
        if (this.#resolution)
            Object.assign(
                requestParams,
                await this.#resolution.resolve(serviceName, false, namespace),
            );
        return requestParams;
    }
}
