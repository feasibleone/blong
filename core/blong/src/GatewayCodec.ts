import got from 'got';
import type { JWTPayload } from 'jose';

import busGateway from 'ut-bus/gateway.js';
import jose from 'ut-bus/jose.js';
import oidc from 'ut-bus/oidc.js';
import type { Resolution } from './Resolution.js';
import tls from './tls.js';

type protocol = 'http' | 'https'
export interface GatewayCodec {
    gateway: ($meta: object, methodName: string) => object;
    codec: ($meta: object, methodType: 'request' | 'publish') => Promise<{
        encode: (...params: unknown[]) => {
            params: object,
            headers: object,
            method: string
        }
        decode: (result: unknown, unpack?: boolean) => object
        requestParams: {
            protocol: protocol
            hostname: string
            port: string
            path: string
            cache?: string
            namespace?: string
        }
    }>
    verify: (token, flags: {nonce?: string, audience: string}, isId?) => Promise<JWTPayload & {per?: string}>
}

export default class GatewayCodecImpl implements GatewayCodec {
    #gatewayCodec: Promise<ReturnType<busGateway>>;
    #protocol: protocol;
    #port;
    #config;
    #tlsClient;
    #resolution: Resolution;

    verify = undefined;

    constructor(config, protocol: protocol, port, errors, sender, resolution) {
        this.#config = config;
        this.#protocol = protocol;
        this.#port = port;
        this.#tlsClient = tls(this.#config.client, true);
        this.#resolution = resolution;

        async function session(token) {
            const result = await sender({
                username: token.oid || token.sub,
                installationId: token.oid || token.sub,
                type: 'oidc',
                password: '*',
                channel: 'web'
            }, {method: 'identity.checkInternal'});
            const [{
                'identity.check': {
                    actorId,
                    sessionId
                },
                permissionMap,
                mle
            }] = result;
            token.per = permissionMap;
            token.ses = sessionId;
            if (mle && mle.mlek) token.enc = JSON.parse(mle.mlek);
            if (mle && mle.mlsk) token.sig = JSON.parse(mle.mlsk);
            token.sub = String(actorId);
        }

        const {verify, get} = oidc({
            async request({
                json,
                method,
                url,
                headers
            }, callback) {
                try {
                    const response = await got(url, {
                        method,
                        headers,
                        responseType: json ? 'json' : undefined
                    });
                    if (response.request) Object.assign(response.request, {method, href: url});
                    callback(null, response, response.body);
                } catch (error) {
                    callback(error);
                }
            },
            discoverService: this.discoverService.bind(this),
            errorPrefix: 'rpc.',
            errors,
            session,
            tls: this.#tlsClient,
            issuers: config.openId || {...config.utLogin !== false && {'ut-login': {audience: 'ut-bus'}}}
        });

        this.#gatewayCodec = (async() => {
            const mleClient = await jose(config.client || {});
            return busGateway({
                errorPrefix: 'rpc.',
                serverInfo: key => ({protocol, port}[key]),
                mleClient,
                errors,
                get
            });
        })();

        this.verify = verify;
    }

    gateway($meta, methodName = $meta.method) {
        if (this.#config.gateway && methodName !== 'identity.checkInternal') {
            const [prefix, method] = methodName.split('/');
            if (method) {
                if (this.#config.gateway[prefix]) return {...this.#config.gateway[prefix], ...$meta.gateway, method};
            } else {
                const [namespace] = prefix.split('.');
                const gw = this.#config.gateway[namespace] || this.#config.gateway[prefix];
                if (gw) return {...gw, ...$meta.gateway, method: prefix};
            }
        }

        if ($meta.gateway) return {...$meta.gateway, method: methodName};
    }

    async codec($meta, methodType) {
        const gatewayConfig = this.gateway($meta);

        if (gatewayConfig) return (await this.#gatewayCodec)(gatewayConfig);

        const [namespace, event] = $meta.method.split('.');

        const op = ['start', 'stop', 'drain'].includes(event) ? event : methodType;

        return {
            encode: (...params) => ({params}),
            decode: result => result,
            requestParams: {
                ...await this.discoverService('rpc-' + namespace),
                path: `/rpc/ports/${namespace}/${op}`
            }
        };
    }

    async discoverService(namespace) {
        const serviceName = namespace.replace(/\//g, '-');
        const params = {
            protocol: this.#config.protocol || this.#protocol,
            hostname: this.#config.host || serviceName,
            port: this.#config.port || this.#port,
            service: this.#config.service
        };
        const requestParams = Object.assign({}, params);
        if (this.#resolution) Object.assign(requestParams, await this.#resolution.resolve(serviceName, false, namespace));
        return requestParams;
    }
}
