import type {Errors, IErrorFactory, IErrorMap, ILocal, ILog, IMeta} from '@feasibleone/blong';
import ky from 'ky';
import {spare} from 'ut-function.timing';

import Remote from './Remote.js';

export interface IGatewayClient {
    start: () => Promise<void>;
    stop: () => Promise<void>;
}

interface IError extends Error {
    type?: string;
    req?: object;
    res?: object;
}

const errorMap: IErrorMap = {
    'gw.notFound': 'Local method "{method}" not found',
    'gw.jsonRpcEmpty': 'JSON RPC response without response and error',
    'gw.jsonRpcHttp': 'JSON RPC returned HTTP error {code}',
};

interface IConfig {
    logLevel?: Parameters<ILog['logger']>[0];
    url: string;
    debug: boolean;
    latency: number;
}
export default class GatewayClientImpl extends Remote implements IGatewayClient {
    #errors: Errors<typeof errorMap>;
    #config: IConfig = {
        url: 'http://localhost:8080/rpc',
        debug: false,
        latency: 100,
    };

    public constructor(
        config: IConfig,
        {log, error, local}: {log: ILog; error: IErrorFactory; local: ILocal}
    ) {
        super(config, {log, error, local});
        this.merge(this.#config, config);
        this.#errors = error.register(errorMap);
    }

    public gateway(meta: object, method: string): void {}

    protected sender(
        methodType: 'request' | 'publish'
    ): (...params: unknown[]) => Promise<unknown> {
        return async (...rest) => {
            const {stream, ...$meta} = rest.pop() as IMeta;
            const params = rest;
            const {$http: {method: httpMethod = 'POST'} = {}} = (params?.[0] || {}) as {
                $http?: {method?: string};
            };
            const {headers, method} = $meta;
            const sendRequest = async (): Promise<unknown> => {
                const url = new URL(method.split('.').join('/'), this.#config.url);
                const response = await ky(url, {
                    // https: this.#https,
                    // followRedirect: false,
                    // isStream: stream,
                    // responseType: 'json',
                    method: httpMethod,
                    json: {
                        jsonrpc: '2.0',
                        method,
                        id: 1,
                        ...($meta.timeout &&
                            $meta.timeout[0] && {
                                timeout: spare($meta.timeout, this.#config.latency),
                            }),
                        params,
                    },
                    headers: headers as Parameters<typeof ky>[1]['headers'],
                });
                const body = await response.json<{
                    jsonrpc?: string;
                    error?: unknown;
                    validation?: unknown;
                    debug?: unknown;
                }>();
                if (body?.error !== undefined) {
                    const error: IError = body.jsonrpc
                        ? Object.assign(new Error(), body.error)
                        : typeof body.error === 'string'
                        ? new Error(body.error)
                        : Object.assign(new Error(), body.error);
                    if (error.type)
                        Object.defineProperty(error, 'name', {
                            value: error.type,
                            configurable: true,
                            enumerable: false,
                        });
                    error.req = {
                        // httpVersion: response.httpVersion,
                        url: url.href,
                        method: httpMethod,
                        ...(this.#config.debug && this.sanitize(params, $meta)),
                    };
                    error.res = {
                        // httpVersion: response.httpVersion,
                        statusCode: response.status,
                    };
                    throw error;
                } else if (response.status < 200 || response.status >= 300) {
                    throw this.#errors['gw.jsonRpcHttp']({
                        statusCode: response.status,
                        statusMessage: response.statusText,
                        // httpVersion: response.httpVersion,
                        // validation: response.body?.validation,
                        // debug: response.body?.debug,
                        params: {
                            code: response.status,
                        },
                        url: url.href,
                        method: httpMethod,
                    });
                } else if (typeof body === 'object' && 'result' in body && !('error' in body)) {
                    const result = body.result;
                    if (/\.service\.get$/.test(method)) {
                        Object.assign(result, {
                            protocol: url.protocol,
                            hostname: url.hostname,
                            port: url.port,
                            path: url.pathname,
                        });
                    }
                    return result;
                } else {
                    throw this.#errors['gw.jsonRpcEmpty']();
                }
            };
            return stream ? [sendRequest()] : sendRequest();
        };
    }
}
