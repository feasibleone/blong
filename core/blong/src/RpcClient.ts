import got, { type HttpsOptions } from 'got';
import timing from 'ut-function.timing';

import type { errors } from '../types.js';
import { type ErrorFactory } from './ErrorFactory.js';
import GatewayCodecImpl, { type GatewayCodec } from './GatewayCodec.js';
import type { Local } from './Local.js';
import type { Log } from './Log.js';
import RemoteImpl, { type Remote } from './Remote.js';
import type { Resolution } from './Resolution.js';
import tls from './tls.js';

export interface RpcClient extends Remote{
    verify: GatewayCodec['verify']
}

interface HTTPError extends Error {
    type?: string;
    req?: object;
    res?: object;
}

const errorMap = {
    'rpc.actionEmpty': {message: 'Listing actions returned empty response', statusCode: 403},
    'rpc.actionHttp': {message: 'Listing actions returned HTTP error {code}', statusCode: 403},
    'rpc.jsonRpcEmpty': 'JSON RPC response without response and error',
    'rpc.jsonRpcHttp': 'JSON RPC returned HTTP error {code}',
    'rpc.jwtInvalid': {message: 'Invalid authentication ({message})', statusCode: 401},
    'rpc.oidcBadIssuer': {message: "OpenID issuer '{issuerId}' is not supported", statusCode: 401},
    'rpc.oidcEmpty': {message: 'OpenID returned empty response', statusCode: 401},
    'rpc.oidcHttp': {message: 'OpenID returned HTTP error {code}', statusCode: 401},
    'rpc.oidcNoIssuer': {message: 'Missing issuer in authentication token', statusCode: 401},
    'rpc.oidcNoKid': {message: 'Missing key id in JWT', statusCode: 401},
    'rpc.unauthorized': {message: 'Operation {method} is not allowed for this user', statusCode: 403}
};

export default class RpcClientImpl extends RemoteImpl implements RpcClient {
    #config = {
        latency: 50,
        debug: false
    };

    #https: HttpsOptions;
    #gatewayCodec: GatewayCodec;
    #resolution: Resolution;
    #errors: errors<typeof errorMap>;

    verify(token, options, isId) {
        return this.#gatewayCodec.verify(token, options, isId);
    }

    gateway(meta, method) {
        return this.#gatewayCodec.gateway(meta, method);
    }

    constructor(config, {log, error, resolution, local}: {log: Log, error: ErrorFactory, resolution: Resolution, local: Local}) {
        super(config, {log, error, local});
        config = this.merge(this.#config, config);
        this.#resolution = resolution;
        this.#errors = error.register(errorMap);
        this.#https = tls(config, true);
        this.#gatewayCodec = new GatewayCodecImpl(
            config,
            'http',
            '8091',
            this.#errors,
            this.sender('request'),
            this.#resolution
        );
    }

    sender(methodType: 'request' | 'publish') {
        return async(msg, ...rest) => {
            const {stream, ...$meta} = rest.pop();
            const {encode, decode, requestParams} = await this.#gatewayCodec.codec($meta, methodType);
            const {params, headers, method = $meta.method} = await encode(msg, ...rest, $meta);
            const sendRequest = async() => {
                try {
                    const response = await got.post<{jsonrpc?: string, error?: unknown, validation?: unknown, debug?: unknown}>(
                        `${requestParams.protocol}://${requestParams.hostname}:${requestParams.port}${requestParams.path}`,
                        {
                            https: this.#https,
                            followRedirect: false,
                            json: {
                                jsonrpc: '2.0',
                                method,
                                id: 1,
                                ...$meta.timeout && $meta.timeout[0] && {timeout: timing.spare($meta.timeout, this.#config.latency)},
                                params
                            },
                            responseType: 'json',
                            headers: {
                                'x-envoy-decorator-operation': method,
                                ...$meta.forward,
                                ...headers
                            }
                        }
                    );
                    const {body} = response;
                    if (body?.error !== undefined) {
                        const error: HTTPError =
                            body.jsonrpc
                                ? Object.assign(new Error(), await decode(body.error, true))
                                : typeof body.error === 'string'
                                    ? new Error(body.error)
                                    : Object.assign(new Error(), body.error);
                        if (error.type) Object.defineProperty(error, 'name', {value: error.type, configurable: true, enumerable: false});
                        error.req = response.request && {
                            httpVersion: response.httpVersion,
                            url: response.request.requestUrl,
                            method: response.request.options.method,
                            ...this.#config.debug && this.sanitize(params, $meta)
                        };
                        error.res = {
                            httpVersion: response.httpVersion,
                            statusCode: response.statusCode
                        };
                        throw error;
                    } else if (response.statusCode < 200 || response.statusCode >= 300) {
                        throw this.#errors['rpc.jsonRpcHttp']({
                            statusCode: response.statusCode,
                            // statusText: response.statusText,
                            statusMessage: response.statusMessage,
                            httpVersion: response.httpVersion,
                            validation: response.body?.validation,
                            debug: response.body?.debug,
                            params: {
                                code: response.statusCode
                            },
                            ...response.request && {
                                url: response.request.requestUrl,
                                method: response.request.options.method
                            }
                        });
                    } else if (typeof body === 'object' && 'result' in body && !('error' in body)) {
                        const result = await decode(body.result);
                        if (/\.service\.get$/.test(method)) Object.assign(result[0], requestParams);
                        return result;
                    } else {
                        throw this.#errors['rpc.jsonRpcEmpty']();
                    }
                } catch (error) {
                    if (this.#resolution && requestParams.cache) { // invalidate cache and retry upon connection fail
                        switch (error.code) {
                            case 'ETIMEDOUT':
                            case 'ESOCKETTIMEDOUT':
                                if (!error.connect) break; // https://www.npmjs.com/package/request#timeouts
                            case 'ENOTFOUND': // eslint-disable-line no-fallthrough
                            case 'ECONNREFUSED':
                                Object.assign(requestParams, await this.#resolution.resolve(requestParams.cache, true, requestParams.namespace));
                                delete requestParams.cache;
                                return sendRequest();
                        }
                    }
                    throw error;
                }
            };
            return stream ? [sendRequest()] : sendRequest();
        };
    }

    async stop() {
    }

    async start() {
    }
}
