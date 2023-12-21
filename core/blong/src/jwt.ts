import basic from '@fastify/basic-auth';
import bearer from '@fastify/bearer-auth';
import cookie from '@fastify/cookie';
import fp from 'fastify-plugin';
import {LRUCache} from 'lru-cache';

import { type errors } from '../types.js';
import { type GatewayCodec } from './GatewayCodec.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth: {credentials: {language?: unknown, [name: string]: unknown}}
  }
  interface FastifyReply {
    myPluginProp: number
  }
}

export default fp<{cache: object | false, audience: string, verify: GatewayCodec['verify'], errors: errors<object>}>(
    async function jwtPlugin(fastify, {cache: cacheConfig, audience, verify, errors}) {
        const cache = (![0, false, 'false'].includes(cacheConfig as string | number | boolean)) && new LRUCache({max: 1000, ...cacheConfig});
        await fastify.register(basic, {
            async validate(username, password, req, reply) {

            }
        });
        fastify.addHook('preValidation', function(request, reply, done) {
            const auth = request.routeOptions.config.auth;
            if (auth !== false) {
                if (auth === 'login') {
                    request.auth = {credentials: {mlek: 'header', mlsk: 'header'}};
                    done();
                } else {
                    return this.verifyBearerAuth(request, reply, done);
                }
            } else done();
        });
        await fastify.register(bearer, {
            keys: new Set([]),
            addHook: false,
            auth: async(token, req) => {
                if (!token) throw errors['gateway.jwtMissingHeader']();
                const cachedCredentials = cache && cache.get(token);
                if (cachedCredentials) {
                    req.auth = {credentials: cachedCredentials};
                    return true;
                }
                const decoded = await verify(token, {audience});
                const {
                    // standard
                    aud,
                    exp,
                    iss,
                    iat,
                    jti,
                    nbf,
                    sub: actorId,
                    // headers
                    typ,
                    cty,
                    alg,
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
                    ...rest
                };
                if (cache) cache.set(token, credentials, {ttl: exp * 1000 - Date.now()});
                req.auth = {credentials};
                return true;
            }
        });
        await fastify.register(cookie, {});
        fastify.decorateRequest('auth');
        fastify.decorateReply('unstate', function(name) {
            this.clearCookie(name);
            //
        });
        fastify.decorateReply('state', function(name, value, {
            // https://hapi.dev/api/?v=21.3.2#server.state()
            ttl: maxAge,
            isSecure: secure,
            isHttpOnly: httpOnly,
            isSameSite: sameSite,
            path,
            domain
        }) {
            this.setCookie(name, value, Object.fromEntries(Object.entries({
                maxAge: maxAge && Math.floor(maxAge / 1000),
                secure,
                httpOnly,
                sameSite,
                path,
                domain
            }).filter(([, value]) => value != null)));
        });
    }, {
        fastify: '4.x',
        name: 'blong-jwt'
    });
