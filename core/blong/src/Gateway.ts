import { Type } from '@sinclair/typebox';
import fastify, { type FastifyRequest, type RouteOptions } from 'fastify';
import os from 'os';
import { after } from 'ut-function.timing';
import { v4 } from 'uuid';

import type { GatewaySchema } from '../types.js';
import { internal, type errors } from '../types.js';
import type { Local } from './Local.js';
import type { Log } from './Log.js';
import type { Resolution } from './Resolution.js';
import { type RpcClient } from './RpcClient.js';
import jwt from './jwt.js';
import { methodParts } from './lib.js';
import swagger from './swagger.js';

const osName = [os.type(), os.platform(), os.release()].join(':');
const hostName = os.hostname();

const typedError = Type.Object({
    message: Type.Optional(Type.String()),
    type: Type.Optional(Type.String()),
    print: Type.Optional(Type.String())
});

const jsonRpcError = Type.Object({ // error
    jsonrpc: Type.Literal('2.0'),
    id: Type.Union([
        Type.String(),
        Type.Number()
    ]),
    error: typedError
});

type GatewayRequest = FastifyRequest & {auth: {credentials: {language?: unknown, [name: string]: unknown}}};

export interface Gateway {
    route: (validations: Record<string, GatewaySchema>, pkg: {name: string, version: string}) => void
    start: () => Promise<void>
    stop: () => Promise<void>
}

const errorMap = {
    'gateway.jwtMissingHeader': {message: 'Missing bearer authorization header', statusCode: 401}
};

declare module 'fastify' {
    interface FastifyContextConfig {
        auth: unknown
        mle?: unknown
    }
}

export default class GatewayImpl extends internal implements Gateway {
    #server: ReturnType<typeof fastify> = null;
    #resolution: Resolution;
    #log: Log;
    #config = {
        host: '0.0.0.0',
        port: 8080,
        logLevel: 'trace' as Parameters<Log['logger']>[0],
        cors: undefined,
        sign: undefined,
        encrypt: undefined,
        public: {
            sign: undefined,
            encrypt: undefined
        },
        debug: false,
        errorFields: [],
        jwt: {
            cache: {},
            audience: 'ut-bus'
        }
    };

    #errors: errors<typeof errorMap>;
    #rpcClient: RpcClient;
    #routes: RouteOptions[] = [];
    #local: Local;
    #errorFields = [];

    constructor(config, {log, remote, error, resolution, local}) {
        super();
        this.#log = log;
        this.merge(this.#config, config);
        this.#errorFields = Object.entries({
            type: true,
            message: true,
            print: true,
            validation: true,
            params: true,
            ...this.#config.debug && {
                stack: true,
                cause: 'error'
            },
            ...this.#config.errorFields
        });
        this.#errors = error.register(errorMap);
        this.#resolution = resolution;
        this.#rpcClient = remote;
        this.#local = local;
    }

    config() {
        return Object.freeze({...this.#config});
    }

    // https://github.com/openzipkin/b3-propagation
    forward(headers) {
        return [
            ['x-request-id'],
            ['x-b3-traceid', () => v4().replace(/-/g, '')],
            ['x-b3-spanid'],
            ['x-b3-parentspanid'],
            ['x-b3-sampled'],
            ['x-b3-flags'],
            ['x-ot-span-context'],
            ['x-ut-stack']
        ].reduce(function(object, [key, value]: [string, () => string]) {
            if (typeof key === 'string' && key in headers) object[key] = headers[key];
            else if (value) object[key] = value();
            return object;
        }, {});
    }

    meta(req: GatewayRequest, version: string, serviceName: string) {
        const {
            'user-agent': frontEnd,
            'geo-position': gps, // https://datatracker.ietf.org/doc/html/draft-daviel-http-geo-header-05
            'x-ut-device': deviceId,
            'x-forwarded-host': forwardedHost,
            'x-forwarded-for': forwardedIp
        } = req.headers || {};
        const {
            localAddress,
            localPort
        } = req.raw?.socket || {};
        const [latitude, longitude] = (typeof gps === 'string') ? gps.split(' ', 1)[0].split(';') : [req.headers.latitude, req.headers.longitude];
        const {language, ...auth} = req.auth?.credentials || {};
        return {
            forward: this.forward(req.headers),
            frontEnd,
            latitude,
            longitude,
            deviceId,
            localAddress,
            localPort,
            ...req.auth?.credentials && {auth, language},
            hostName: forwardedHost || req.hostname,
            ipAddress: ([].concat(forwardedIp)[0] || req.socket.remoteAddress).split(',')[0],
            machineName: hostName,
            os: osName,
            version,
            serviceName,
            httpRequest: {
                url: req.protocol + '://' + req.hostname + req.url,
                state: req.cookies,
                headers: req.headers
            }
        };
    }

    applyMeta(response, {httpResponse}: {httpResponse?: unknown}) {
        httpResponse && [
            'code', 'redirect', 'type',
            'created', 'etag', 'location', 'ttl', 'temporary', 'permanent', 'state', 'unstate', // todo
            'header'
        ].forEach(method => {
            if (Object.prototype.hasOwnProperty.call(httpResponse, method)) {
                const params = httpResponse[method];
                if (Array.isArray(params?.[0])) { // setting multiple headers and cookies require nested arrays
                    params.forEach(param => response[method](...[].concat(param)));
                } else {
                    response[method](...[].concat(params));
                }
            }
        });
        return response;
    }

    route(validations: Record<string, GatewaySchema>, pkg) {
        const wildcard: [string, GatewaySchema][] = Array.from(new Set(Object.keys(validations).map(name => name.split('.', 1)[0])).values()).map(namespace => [`${namespace}.*`, {
            params: Type.Any(),
            result: Type.Any(),
            auth: false
        }]);
        Object.entries(validations).concat(wildcard).forEach(([method, value]) => {
            const reqName = `ports.${method.split('.', 1)[0]}.request`;
            const pubName = `ports.${method.split('.', 1)[0]}.publish`;
            const isWildcard = method.endsWith('.*');
            this.#resolution?.announce(method.split('.')[0].replace(/\//g, '-'), this.#config.port);
            this.#routes.push({
                method: 'method' in value ? value.method : 'POST',
                url: 'path' in value ? `/rpc/${method.split('.', 1)[0]}${value.path}` : `/rpc/${method.split('.').join('/')}`,
                config: {
                    auth: value.auth ?? 'jwt'
                },
                schema: Type && {
                    ...'body' in value ? {body: value.body} : 'params' in value ? {
                        body: Type.Object({
                            jsonrpc: Type.Literal('2.0'),
                            id: Type.Optional(Type.Union([
                                Type.String(),
                                Type.Number()
                            ])),
                            method: isWildcard ? Type.String() : Type.Literal(method),
                            params: value.params
                        })
                    } : undefined,
                    ...'response' in value ? {response: {'2xx': value.response}} : 'result' in value ? {
                        response: ((this.#config.sign || this.#config.encrypt) && (value.auth ?? 'jwt')) ? {
                            '2xx': value.result,
                            '3xx': typedError,
                            '4xx': typedError,
                            '5xx': typedError
                        } : {
                            '2xx': Type.Union([
                                Type.Object({ // response
                                    jsonrpc: Type.Literal('2.0'),
                                    id: Type.Union([
                                        Type.String(),
                                        Type.Number()
                                    ]),
                                    result: value.result
                                }),
                                Type.Object({ // notification
                                    jsonrpc: Type.Literal('2.0'),
                                    result: Type.Boolean()
                                })
                            ]),
                            '3xx': jsonRpcError,
                            '4xx': jsonRpcError,
                            '5xx': jsonRpcError
                        }
                    } : undefined,
                    security: [value.auth === false ? {} : {
                        'ut-login': ['api']
                    }],
                    tags: [method.split('.')[0] + ' ' + pkg.name + '@' + pkg.version]
                },
                // onError: async(request, reply, error) => {
                //     const {id} = 'params' in value ? request.body as {id: string} : {id: 1};
                //     return {
                //         jsonrpc: '2.0',
                //         id,
                //         error: this.formatError(error)
                //     };
                // },
                handler: async(request: GatewayRequest, reply) => {
                    const {id, params, timeout, expect} = 'params' in value ? request.body as {id: string, params: unknown, timeout: unknown, expect: unknown} : {id: 1, params: {}, timeout: false, expect: undefined};
                    const methodName = isWildcard ? new URL(request.url, 'http://localhost').pathname.slice(5).split('/').join('.') : method;
                    try {
                        const meta = {
                            mtid: !id ? 'notification' : 'request',
                            method: methodName,
                            opcode: methodName.split('.').pop(),
                            ...timeout && {timeout: after(timeout)},
                            ...expect && {expect: [].concat(expect)},
                            ...this.meta(request, pkg?.version, methodName.split('.')[0])
                        };
                        const notfound = () => reply.code(404).type('text/plain').send('namespace not found for method ' + methodName);
                        if (isWildcard && !validations[methodParts(methodName)]) {
                            return reply.code(404).type('text/plain').send('validation not found for method ' + methodName);
                        }

                        if (!('result' in value)) {
                            const req = this.#local.get(reqName);
                            if (!req) return notfound();
                            const [result, resultMeta] = await req.method(params, meta) ?? null;
                            this.applyMeta(reply, resultMeta);
                            return result;
                        } else if (id == null) {
                            const pub = this.#local.get(pubName);
                            if (!pub) return notfound();
                            pub.method(params, meta);
                            return {
                                jsonrpc: '2.0',
                                result: true
                            };
                        } else {
                            const req = this.#local.get(reqName);
                            if (!req) return notfound();
                            const [result, resultMeta] = await req.method(params, meta) ?? null;
                            this.applyMeta(reply, resultMeta);
                            return {
                                jsonrpc: '2.0',
                                id,
                                result
                            };
                        }
                    } catch (error) {
                        this.applyMeta(reply.header('x-envoy-decorator-operation', methodName).code(error?.statusCode || 500), {httpResponse: error.httpResponse});
                        return {
                            jsonrpc: '2.0',
                            id,
                            error: this.formatError(error)
                        };
                    }
                }
            });
        });
    }

    async start() {
        this.#server = fastify({
            logger: this.#log?.child({name: 'gateway'}, {level: this.#config.logLevel})
        });
        this.#server.setErrorHandler((error, request: {body: {id?: unknown}}, reply) => {
            return reply.status(500).send({
                jsonrpc: '2.0',
                id: request.body.id,
                error: this.formatError(error)
            });
        });
        await this.#server.register(jwt, {
            cache: this.#config.jwt?.cache,
            verify: (token, options) => this.#rpcClient.verify(token, options),
            errors: this.#errors,
            audience: this.#config.jwt.audience
        });
        if (this.#config.cors) await this.#server.register((await import('./cors.js')).default, this.#config.cors);
        if (this.#config.sign || this.#config.encrypt) await this.#server.register((await import('./mle.js')).default, this.#config);
        await this.#server.register(swagger, {
            version: ''
        });
        this.#routes.forEach(route => this.#server.route(route));
        await this.#server.listen({
            port: this.#config.port,
            host: this.#config.host
        });
    }

    async stop() {
        await this.#server?.close();
        this.#server = null;
    }

    async restart() {
        await this.stop();
        await this.start();
    }

    formatError(error) {
        return this.#errorFields
            .reduce((e, [key, value]) => {
                if (value && typeof error[key] !== 'undefined') {
                    switch (value) {
                        case true:
                            e[key] = error[key];
                            break;
                        case 'error':
                            e[key] = this.formatError(error[key]);
                            break;
                        default:
                            break;
                    }
                }
                return e;
            }, {});
    }
}
