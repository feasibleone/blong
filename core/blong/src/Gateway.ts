import {Type, type TSchema} from '@sinclair/typebox';
import fastify, {type FastifyRequest, type RouteOptions} from 'fastify';
import os from 'os';
import type {LevelWithSilent} from 'pino';
import {after} from 'ut-function.timing';
import {v4} from 'uuid';

import type {GatewaySchema, IMeta} from '../types.js';
import {Internal, type Errors} from '../types.js';
import type {ILocal} from './Local.js';
import type {ILog} from './Log.js';
import type {IResolution} from './Resolution.js';
import type {IRpcClient} from './RpcClient.js';
import type {IErrorFactory, IErrorMap} from './error.js';
import jwt from './jwt.js';
import {methodParts} from './lib.js';
import type {IConfig as IConfigMLE} from './mle.js';
import swagger from './swagger.js';

const osName: string = [os.type(), os.platform(), os.release()].join(':');
const hostName: string = os.hostname();

const typedError: TSchema = Type.Object({
    message: Type.Optional(Type.String()),
    type: Type.Optional(Type.String()),
    print: Type.Optional(Type.String()),
});

const jsonRpcError: TSchema = Type.Object({
    // error
    jsonrpc: Type.Literal('2.0'),
    id: Type.Union([Type.String(), Type.Number()]),
    error: typedError,
});

type GatewayRequest = FastifyRequest;

export interface IGateway {
    route: (
        validations: Record<string, GatewaySchema>,
        pkg: {name: string; version: string}
    ) => void;
    start: () => Promise<void>;
    stop: () => Promise<void>;
}

const errorMap: IErrorMap = {
    'gateway.jwtMissingHeader': {message: 'Missing bearer authorization header', statusCode: 401},
};

declare module 'fastify' {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    interface FastifyContextConfig {
        auth: unknown;
        mle?: unknown;
    }
}

interface IConfig extends IConfigMLE {
    host?: string;
    port?: number;
    logLevel?: LevelWithSilent;
    cors?: unknown;
    debug?: boolean;
    errorFields: unknown[];
    jwt: {
        cache: object;
        audience: string;
    };
}
export default class Gateway extends Internal implements IGateway {
    #server: ReturnType<typeof fastify> = null;
    #resolution: IResolution;
    #log: ILog;
    #config: IConfig = {
        host: '0.0.0.0',
        port: 8080,
        logLevel: 'trace',
        cors: undefined,
        sign: undefined,
        encrypt: undefined,
        public: {
            sign: undefined,
            encrypt: undefined,
        },
        debug: false,
        errorFields: [],
        jwt: {
            cache: {},
            audience: 'ut-bus',
        },
    };

    #errors: Errors<typeof errorMap>;
    #rpcClient: IRpcClient;
    #routes: RouteOptions[] = [];
    #local: ILocal;
    #errorFields: [string, unknown][] = [];

    public constructor(
        config: IConfig,
        {
            log,
            remote,
            error,
            resolution,
            local,
        }: {
            log?: ILog;
            error?: IErrorFactory;
            remote?: IRpcClient;
            local?: ILocal;
            resolution?: IResolution;
        }
    ) {
        super();
        this.#log = log;
        this.merge(this.#config, config);
        this.#errorFields = Object.entries({
            type: true,
            message: true,
            print: true,
            validation: true,
            params: true,
            ...(this.#config.debug && {
                stack: true,
                cause: 'error',
            }),
            ...this.#config.errorFields,
        });
        this.#errors = error.register(errorMap);
        this.#resolution = resolution;
        this.#rpcClient = remote;
        this.#local = local;
    }

    protected config(): object {
        return Object.freeze({...this.#config});
    }

    // https://github.com/openzipkin/b3-propagation
    private _forward(headers: object): object {
        return [
            ['x-request-id'],
            ['x-b3-traceid', () => v4().replace(/-/g, '')],
            ['x-b3-spanid'],
            ['x-b3-parentspanid'],
            ['x-b3-sampled'],
            ['x-b3-flags'],
            ['x-ot-span-context'],
            ['x-ut-stack'],
        ].reduce(function (object: object, [key, value]: [string, () => string]) {
            if (typeof key === 'string' && key in headers) object[key] = headers[key];
            else if (value) object[key] = value();
            return object;
        }, {});
    }

    private _meta(req: GatewayRequest, version: string, serviceName: string): Partial<IMeta> {
        const {
            'user-agent': frontEnd,
            'geo-position': gps, // https://datatracker.ietf.org/doc/html/draft-daviel-http-geo-header-05
            'x-ut-device': deviceId,
            'x-forwarded-host': forwardedHost,
            'x-forwarded-for': forwardedIp,
        } = req.headers || {};
        const {localAddress, localPort} = req.raw?.socket || {};
        const [latitude, longitude] =
            typeof gps === 'string'
                ? gps.split(' ', 1)[0].split(';')
                : [req.headers.latitude, req.headers.longitude];
        const {language, ...auth} = req.auth?.credentials || {};
        return {
            forward: this._forward(req.headers),
            frontEnd,
            latitude,
            longitude,
            deviceId,
            localAddress,
            localPort,
            ...(req.auth?.credentials && {auth, language}),
            hostName: forwardedHost || req.hostname,
            ipAddress: ([].concat(forwardedIp)[0] || req.socket.remoteAddress).split(',')[0],
            machineName: hostName,
            os: osName,
            version,
            serviceName,
            httpRequest: {
                url: req.protocol + '://' + req.hostname + req.url,
                state: req.cookies,
                headers: req.headers,
            },
        };
    }

    private _applyMeta(response: object, {httpResponse}: {httpResponse?: unknown}): object {
        if (httpResponse)
            [
                'code',
                'redirect',
                'type',
                'created',
                'etag',
                'location',
                'ttl',
                'temporary',
                'permanent',
                'state',
                'unstate', // todo
                'header',
            ].forEach(method => {
                if (Object.prototype.hasOwnProperty.call(httpResponse, method)) {
                    const params = httpResponse[method];
                    if (Array.isArray(params?.[0])) {
                        // setting multiple headers and cookies require nested arrays
                        params.forEach(param => response[method](...[].concat(param)));
                    } else {
                        response[method](...[].concat(params));
                    }
                }
            });
        return response;
    }

    public route(
        validations: Record<string, GatewaySchema>,
        pkg: {name: string; version: string}
    ): void {
        const wildcard: [string, GatewaySchema][] = Array.from(
            new Set(Object.keys(validations).map(name => name.split('.', 1)[0])).values()
        ).map(namespace => [
            `${namespace}.*`,
            {
                params: Type.Any(),
                result: Type.Any(),
                auth: false,
            },
        ]);
        Object.entries(validations)
            .concat(wildcard)
            .forEach(([method, value]) => {
                const reqName = `ports.${method.split('.', 1)[0]}.request`;
                const pubName = `ports.${method.split('.', 1)[0]}.publish`;
                const isWildcard = method.endsWith('.*');
                this.#resolution?.announce(
                    method.split('.')[0].replace(/\//g, '-'),
                    this.#config.port
                );
                this.#routes.push({
                    method: 'method' in value ? value.method : 'POST',
                    url:
                        'path' in value
                            ? `/rpc/${method.split('.', 1)[0]}${value.path}`
                            : `/rpc/${method.split('.').join('/')}`,
                    config: {
                        auth: value.auth ?? 'jwt',
                    },
                    schema: Type && {
                        ...('body' in value
                            ? {body: value.body}
                            : 'params' in value
                            ? {
                                  body: Type.Object({
                                      jsonrpc: Type.Literal('2.0'),
                                      id: Type.Optional(Type.Union([Type.String(), Type.Number()])),
                                      method: isWildcard ? Type.String() : Type.Literal(method),
                                      params: value.params,
                                  }),
                              }
                            : undefined),
                        /* eslint-disable @typescript-eslint/naming-convention */
                        ...('response' in value
                            ? {response: {'2xx': value.response}}
                            : 'result' in value
                            ? {
                                  response:
                                      (this.#config.sign || this.#config.encrypt) &&
                                      (value.auth ?? 'jwt')
                                          ? {
                                                '2xx': value.result,
                                                '3xx': typedError,
                                                '4xx': typedError,
                                                '5xx': typedError,
                                            }
                                          : {
                                                '2xx': Type.Union([
                                                    Type.Object({
                                                        // response
                                                        jsonrpc: Type.Literal('2.0'),
                                                        id: Type.Union([
                                                            Type.String(),
                                                            Type.Number(),
                                                        ]),
                                                        result: value.result,
                                                    }),
                                                    Type.Object({
                                                        // notification
                                                        jsonrpc: Type.Literal('2.0'),
                                                        result: Type.Boolean(),
                                                    }),
                                                ]),
                                                '3xx': jsonRpcError,
                                                '4xx': jsonRpcError,
                                                '5xx': jsonRpcError,
                                            },
                              }
                            : undefined),
                        /* eslint-enable @typescript-eslint/naming-convention */
                        security: [
                            value.auth === false
                                ? {}
                                : {
                                      'ut-login': ['api'],
                                  },
                        ],
                        tags: [method.split('.')[0] + ' ' + pkg.name + '@' + pkg.version],
                    },
                    // onError: async(request, reply, error) => {
                    //     const {id} = 'params' in value ? request.body as {id: string} : {id: 1};
                    //     return {
                    //         jsonrpc: '2.0',
                    //         id,
                    //         error: this.formatError(error)
                    //     };
                    // },
                    handler: async (request: GatewayRequest, reply) => {
                        const {id, params, timeout, expect} =
                            'params' in value
                                ? (request.body as {
                                      id: string;
                                      params: unknown;
                                      timeout: unknown;
                                      expect: unknown;
                                  })
                                : {id: 1, params: {}, timeout: false, expect: undefined};
                        const methodName = isWildcard
                            ? new URL(request.url, 'http://localhost').pathname
                                  .slice(5)
                                  .split('/')
                                  .join('.')
                            : method;
                        try {
                            const meta = {
                                mtid: !id ? 'notification' : 'request',
                                method: methodName,
                                opcode: methodName.split('.').pop(),
                                ...(timeout && {timeout: after(timeout)}),
                                ...(expect && {expect: [].concat(expect)}),
                                ...this._meta(request, pkg?.version, methodName.split('.')[0]),
                            };
                            const notfound = (): unknown =>
                                reply
                                    .code(404)
                                    .type('text/plain')
                                    .send('namespace not found for method ' + methodName);
                            if (isWildcard && !validations[methodParts(methodName)]) {
                                return reply
                                    .code(404)
                                    .type('text/plain')
                                    .send('validation not found for method ' + methodName);
                            }

                            if (!('result' in value)) {
                                const req = this.#local.get(reqName);
                                if (!req) return notfound();
                                const [result, resultMeta] =
                                    (await req.method(params, meta)) ?? null;
                                this._applyMeta(reply, resultMeta);
                                return result;
                            } else if (id == null) {
                                const pub = this.#local.get(pubName);
                                if (!pub) return notfound();
                                pub.method(params, meta).catch(error => {});
                                return {
                                    jsonrpc: '2.0',
                                    result: true,
                                };
                            } else {
                                const req = this.#local.get(reqName);
                                if (!req) return notfound();
                                const [result, resultMeta] =
                                    (await req.method(params, meta)) ?? null;
                                this._applyMeta(reply, resultMeta);
                                return {
                                    jsonrpc: '2.0',
                                    id,
                                    result,
                                };
                            }
                        } catch (error) {
                            this._applyMeta(
                                reply
                                    .header('x-envoy-decorator-operation', methodName)
                                    .code(error?.statusCode || 500),
                                {httpResponse: error.httpResponse}
                            );
                            return {
                                jsonrpc: '2.0',
                                id,
                                error: this._formatError(error),
                            };
                        }
                    },
                });
            });
    }

    public async start(): Promise<void> {
        this.#server = fastify({
            logger: this.#log?.child({name: 'gateway'}, {level: this.#config.logLevel}),
        });
        this.#server.setErrorHandler((error, request: {body: {id?: unknown}}, reply) => {
            return reply.status(500).send({
                jsonrpc: '2.0',
                id: request.body?.id,
                error: this._formatError(error),
            });
        });
        await this.#server.register(jwt, {
            cache: this.#config.jwt?.cache,
            verify: (token, options) => this.#rpcClient.verify(token, options),
            errors: this.#errors,
            audience: this.#config.jwt.audience,
        });
        if (this.#config.cors)
            await this.#server.register((await import('./cors.js')).default, this.#config.cors);
        if (this.#config.sign || this.#config.encrypt)
            await this.#server.register((await import('./mle.js')).default, this.#config);
        await this.#server.register(swagger, {
            version: '',
        });
        this.#routes.forEach(route => this.#server.route(route));
        await this.#server.listen({
            port: this.#config.port,
            host: this.#config.host,
        });
    }

    public async stop(): Promise<void> {
        await this.#server?.close();
        this.#server = null;
    }

    protected async restart(): Promise<void> {
        await this.stop();
        await this.start();
    }

    private _formatError(error: Error): object {
        return this.#errorFields.reduce((e, [key, value]) => {
            if (value && typeof error[key] !== 'undefined') {
                switch (value) {
                    case true:
                        e[key] = error[key];
                        break;
                    case 'error':
                        e[key] = this._formatError(error[key]);
                        break;
                    default:
                        break;
                }
            }
            return e;
        }, {});
    }
}
