import basic from '@fastify/basic-auth';
import bearer from '@fastify/bearer-auth';
import cookie from '@fastify/cookie';
import type {FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest} from 'fastify';
import fp from 'fastify-plugin';
import {LRUCache} from 'lru-cache';

import {type Errors} from '../types.js';
import {type IGatewayCodec} from './GatewayCodec.js';

declare module 'fastify' {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    interface FastifyRequest {
        auth: {
            credentials: {
                language?: unknown;
                mlek?: object | 'header';
                mlsk?: object | 'header';
                permissionMap?: Buffer;
                actorId?: string | number;
                sessionId?: string;
            };
        };
    }
    // eslint-disable-next-line @typescript-eslint/naming-convention
    interface FastifyReply {
        unstate: (name: string) => this;
        state: (name: string, value: string, options: unknown) => this;
    }
}

export default fp<{
    cache: object | false;
    audience: string;
    verify: IGatewayCodec['verify'];
    errors: Errors<object>;
}>(
    async function jwtPlugin(
        fastify: FastifyInstance,
        {cache: cacheConfig, audience, verify, errors}: FastifyPluginOptions
    ) {
        const cache =
            ![0, false, 'false'].includes(cacheConfig as string | number | boolean) &&
            new LRUCache({max: 1000, ...cacheConfig});
        await fastify.register(basic, {
            async validate(username: string, password: string, req: unknown, reply: unknown) {},
        });
        fastify.addHook(
            'preValidation',
            function (request: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) {
                const auth = request.routeOptions.config.auth;
                if (auth !== false) {
                    if (auth === 'login') {
                        request.auth = {credentials: {mlek: 'header', mlsk: 'header'}};
                        done();
                    } else {
                        return this.verifyBearerAuth(request, reply, done);
                    }
                } else done();
            }
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
                    exp, // eslint-disable-line @typescript-eslint/no-unused-vars
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
                const credentials = {
                    mlek,
                    mlsk,
                    permissionMap: Buffer.from(per, 'base64'),
                    actorId,
                    sessionId,
                    ...rest,
                };
                if (cache) cache.set(token, credentials, {ttl: exp * 1000 - Date.now()});
                req.auth = {credentials};
                return true;
            },
        });
        await fastify.register(cookie, {});
        fastify.decorateRequest('auth');
        fastify.decorateReply('unstate', function (name: string) {
            return this.clearCookie(name);
        });
        fastify.decorateReply(
            'state',
            function (
                name: string,
                value: string,
                {
                    // https://hapi.dev/api/?v=21.3.2#server.state()
                    ttl: maxAge,
                    isSecure: secure,
                    isHttpOnly: httpOnly,
                    isSameSite: sameSite,
                    path,
                    domain,
                }: {
                    ttl?: number;
                    isSecure?: boolean;
                    isHttpOnly?: boolean;
                    isSameSite?: boolean;
                    path?: string;
                    domain?: string;
                }
            ) {
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
                        }).filter(([, value]) => value != null)
                    )
                );
            }
        );
    },
    {
        fastify: '4.x',
        name: 'blong-jwt',
    }
);
