import got, {type HTTPAlias, type Headers} from 'got';
import type {JWTPayload} from 'jose';

import busGateway from 'ut-bus/gateway.js';
import jose from 'ut-bus/jose.js';
import oidc from 'ut-bus/oidc.js';
import type {IMeta} from '../types.js';
import type {IResolution} from './Resolution.js';
import tls from './tls.js';

type Protocol = 'http' | 'https';
export interface IGatewayCodec {
    gateway: ($meta: object, methodName: string) => object;
    codec: (
        $meta: object,
        methodType: 'request' | 'publish'
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
        token,
        flags: {nonce?: string; audience: string},
        isId?
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
    utLogin?: unknown;
}

type Sender = (a: unknown, b: unknown) => Promise<unknown>;

export default class GatewayCodecImpl implements IGatewayCodec {
    #gatewayCodec: Promise<ReturnType<busGateway>>;
    #protocol: Protocol;
    #port: string;
    #config: IConfig;
    #tlsClient: object;
    #resolution: IResolution;

    public verify: IGatewayCodec['verify'] = undefined;

    public constructor(
        config: IConfig,
        protocol: Protocol,
        port: string,
        errors: unknown,
        sender: Sender,
        resolution: IResolution
    ) {
        this.#config = config;
        this.#protocol = protocol;
        this.#port = port;
        this.#tlsClient = tls(this.#config.client, true);
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
                {method: 'identity.checkInternal'}
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
                }
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
                callback: (error: Error, response?: unknown, body?: unknown) => void
            ) {
                try {
                    const response = await got(url, {
                        method,
                        headers,
                        responseType: json ? 'json' : undefined,
                    });
                    if (response.request) Object.assign(response.request, {method, href: url});
                    callback(null, response, response.body);
                } catch (error) {
                    callback(error);
                }
            },
            discoverService: this._discoverService.bind(this),
            errorPrefix: 'rpc.',
            errors,
            session,
            tls: this.#tlsClient,
            issuers: config.openId || {
                ...(config.utLogin !== false && {'ut-login': {audience: 'ut-bus'}}),
            },
        });

        this.#gatewayCodec = (async () => {
            const mleClient = await jose(config.client || {});
            return busGateway({
                errorPrefix: 'rpc.',
                serverInfo: key => ({protocol, port}[key]),
                mleClient,
                errors,
                get,
            });
        })();

        this.verify = verify;
    }

    public gateway($meta: IMeta, methodName: string = $meta.method): object {
        if (this.#config.gateway && methodName !== 'identity.checkInternal') {
            const [prefix, method] = methodName.split('/');
            if (method) {
                if (this.#config.gateway[prefix])
                    return {...this.#config.gateway[prefix], ...$meta.gateway, method};
            } else {
                const [namespace] = prefix.split('.');
                const gw = this.#config.gateway[namespace] || this.#config.gateway[prefix];
                if (gw) return {...gw, ...$meta.gateway, method: prefix};
            }
        }

        if ($meta.gateway) return {...$meta.gateway, method: methodName};
    }

    public async codec(
        $meta: IMeta,
        methodType: 'request' | 'publish'
    ): ReturnType<IGatewayCodec['codec']> {
        const gatewayConfig = this.gateway($meta);

        if (gatewayConfig) return (await this.#gatewayCodec)(gatewayConfig);

        const [namespace, event] = $meta.method.split('.');

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
            service: this.#config.service,
        };
        const requestParams = Object.assign({}, params);
        if (this.#resolution)
            Object.assign(
                requestParams,
                await this.#resolution.resolve(serviceName, false, namespace)
            );
        return requestParams;
    }
}
