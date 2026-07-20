import basic from '@fastify/basic-auth';
import bearer from '@fastify/bearer-auth';
import cookie from '@fastify/cookie';
import {type Errors, type ILocal} from '@feasibleone/blong/types';
import type {FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest} from 'fastify';
import fp from 'fastify-plugin';
import {LRUCache} from 'lru-cache';
import isPublic from './public.ts';

import {type IGatewayCodec} from './GatewayCodec.ts';

declare module 'fastify' {
    interface FastifyRequest {
        auth: {
            credentials: {
                language?: unknown;
                mlek?: object | 'header';
                mlsk?: object | 'header';
                permissionMap?: Buffer;
                actorId?: string | number;
                sessionId?: string;
                /** Allowed action methodIds — populated by the authorize handler. */
                actions?: string[];
            };
        };
    }
    interface FastifyReply {
        unstate: (name: string) => this;
        state: (name: string, value: string, options: unknown) => this;
    }
    interface FastifyContextConfig {
        methodName?: string;
    }
}

export default fp<{
    cache: object | false;
    audience: string;
    verify: IGatewayCodec['verify'];
    errors: Errors<object>;
    authorize?: string;
    local?: ILocal;
    methodId?: (name: string) => string;
    methodParts?: (name: string) => string;
}>(
    async function jwtPlugin(
        fastify: FastifyInstance,
        {
            cache: cacheConfig,
            audience,
            verify,
            errors,
            authorize,
            local,
            methodId,
            methodParts,
        }: FastifyPluginOptions,
    ) {
        const cache =
            ![0, false, 'false'].includes(cacheConfig as string | number | boolean) &&
            new LRUCache({max: 1000, ...cacheConfig});
        await fastify.register(basic, {
            async validate(_username: string, _password: string, _req: unknown, _reply: unknown) {},
        });
        fastify.addHook(
            'preValidation',
            function (request: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) {
                const auth = request.routeOptions.config.auth;
                if (auth !== false && !isPublic(request.originalUrl)) {
                    if (auth === 'login') {
                        request.auth = {credentials: {mlek: 'header', mlsk: 'header'}};
                        done();
                    } else {
                        return this?.verifyBearerAuth?.(request, reply, done);
                    }
                } else done();
            },
        );
        await fastify.register(bearer, {
            keys: new Set([]),
            addHook: false,
            auth: async (token, req) => {
                if (!token) throw errors['gateway.jwtMissingHeader']();
                const cachedCredentials = cache && cache.get(token);
                if (cachedCredentials) {
                    req.auth = {credentials: cachedCredentials};
                    return true;
                }
                const decoded = await verify(token, {audience});
                const {
                    // standard
                    exp,
                    aud, // eslint-disable-line @typescript-eslint/no-unused-vars
                    iss, // eslint-disable-line @typescript-eslint/no-unused-vars
                    iat, // eslint-disable-line @typescript-eslint/no-unused-vars
                    jti, // eslint-disable-line @typescript-eslint/no-unused-vars
                    nbf, // eslint-disable-line @typescript-eslint/no-unused-vars
                    sub: actorId,
                    // headers
                    typ, // eslint-disable-line @typescript-eslint/no-unused-vars
                    cty, // eslint-disable-line @typescript-eslint/no-unused-vars
                    alg, // eslint-disable-line @typescript-eslint/no-unused-vars
                    // custom
                    sig: mlsk,
                    enc: mlek,
                    ses: sessionId,
                    per = '',
                    // arbitrary
                    ...rest
                } = decoded;
                const permissionMap = Buffer.from(per, 'base64');
                const credentials: Record<string, unknown> = {
                    mlek,
                    mlsk,
                    permissionMap,
                    actorId,
                    sessionId,
                    ...rest,
                };

                // Call the authorize handler to resolve the list of allowed actions
                if (authorize && local && methodId && methodParts) {
                    const handlerName = methodParts(authorize);
                    const reqName = `ports.${handlerName.split('.', 1)[0]}.request`;
                    const handler = local.get(reqName);
                    if (handler) {
                        const result = await handler.method(
                            {permissionMap},
                            {
                                method: handlerName,
                                mtid: 'request',
                            },
                        );
                        credentials.actions = Array.isArray(result) ? result[0] : result;
                    }
                }

                if (cache) cache.set(token, credentials, {ttl: exp * 1000 - Date.now()});
                req.auth = {credentials: credentials as FastifyRequest['auth']['credentials']};
                return true;
            },
        });

        // Authorization hook: check the called method against allowed actions
        if (authorize && local && methodId) {
            fastify.addHook('preHandler', function (request, _reply, done) {
                // Routes with auth: false or auth: 'login' don't go through bearer auth,
                // so credentials have no actions. Skip the authorization check.
                if (
                    !request.routeOptions.config.auth ||
                    request.routeOptions.config.auth === 'login'
                ) {
                    done();
                    return;
                }
                // The authorize handler itself must be accessible without authorization,
                // otherwise we have a chicken-and-egg problem — you'd need authorization
                // to call the handler that resolves authorization.
                const methodName = request.routeOptions.config.methodName;
                if (authorize && methodName && methodParts) {
                    const normalizedMethod = methodParts(authorize);
                    if (methodName === normalizedMethod) {
                        done();
                        return;
                    }
                }
                const credentials = request.auth?.credentials;
                if (!credentials?.actions) {
                    done(new Error('Authorization denied: no actions resolved'));
                    return;
                }
                if (!methodName) {
                    done(); // no method configured — allow (backward compat)
                    return;
                }
                const requestedId = methodId(methodName);
                if (credentials.actions.includes(requestedId)) {
                    done();
                } else {
                    const error = new Error(
                        `Authorization denied: method "${methodName}" not allowed`,
                    ) as Error & {statusCode: number};
                    error.statusCode = 403;
                    done(error);
                }
            });
        }

        await fastify.register(cookie, {});
        fastify.decorateRequest('auth');
        fastify.decorateReply('unstate', function (name: string) {
            return this.clearCookie(name);
        });
        (fastify.decorateReply as (name: string, fn: unknown) => void)(
            'state',
            function (this: FastifyReply, name: string, value: string, options: unknown) {
                const {
                    ttl: maxAge,
                    isSecure: secure,
                    isHttpOnly: httpOnly,
                    isSameSite: sameSite,
                    path,
                    domain,
                } = options as {
                    ttl?: number;
                    isSecure?: boolean;
                    isHttpOnly?: boolean;
                    isSameSite?: boolean;
                    path?: string;
                    domain?: string;
                };
                return this.setCookie(
                    name,
                    value,
                    Object.fromEntries(
                        Object.entries({
                            maxAge: maxAge && Math.floor(maxAge / 1000),
                            secure,
                            httpOnly,
                            sameSite,
                            path,
                            domain,
                        }).filter(([, value]) => value != null),
                    ),
                );
            },
        );
    },
    {
        fastify: '5.x',
        name: 'blong-jwt',
    },
);
