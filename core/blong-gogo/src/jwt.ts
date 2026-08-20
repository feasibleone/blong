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
                /** Audit record id of the access-check audit for this request (set by `recordAccessAudit`). */
                auditId?: string;
                /** Allowed action methodIds — populated by the authorize handler. */
                actions?: string[];
            };
        };
    }
    interface FastifyReply {
        unstate: (name: string, options?: unknown) => this;
        state: (name: string, value: string, options: unknown) => this;
    }
    interface FastifyContextConfig {
        methodName?: string;
        audit?: boolean;
        skipAuthorize?: boolean;
    }
}

/**
 * Methods that must never be recorded by the access-check audit — they are
 * part of the access-control machinery itself and would recurse.
 */
const AUDIT_HARD_EXCLUDE = ['access.audit.record', 'access.authorization.list'];

/** Entity tables whose DML carries a sanitised detail summary in the audit. */
const AUDIT_DML_ENTITIES = [
    'user',
    'role',
    'capability',
    'action',
    'credential',
    'access',
    'policy',
    'flow',
];
const AUDIT_WRITE_OPS = ['add', 'edit', 'remove', 'insert', 'update', 'delete', 'merge'];

/**
 * Sanitised DML context for `access.*` write methods — the entity plus its
 * id/name keys only.  Full params (credentials, hashes, descriptions) are
 * deliberately never recorded.
 */
function auditDetail(methodName: string, params: unknown): object | undefined {
    const [subject, object, operation] = String(methodName).split('.');
    if (
        subject !== 'access' ||
        !AUDIT_DML_ENTITIES.includes(object) ||
        !AUDIT_WRITE_OPS.includes(operation)
    ) {
        return undefined;
    }
    const p = (params && typeof params === 'object' ? params : {}) as Record<string, unknown>;
    const summary: Record<string, unknown> = {entity: object};
    for (const [key, value] of Object.entries(p)) {
        if (
            /Id$|Name$|Key$/.test(key) &&
            (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
        ) {
            summary[key] = value;
        }
    }
    return summary;
}

/**
 * Best-effort recording of an access-control decision at the gateway access
 * check.  Resolves the configured audit handler (like `authorize`) and hands
 * it a single audit entry with the actor/session/method/outcome plus sanitised
 * DML context.  The inserted record key is exposed on `request.auth.credentials.
 * auditId` (→ `$meta.auth.auditId`).  Callers await it but must never let an
 * audit failure fail the request.
 */
async function recordAccessAudit(
    request: FastifyRequest,
    audit: {handler: string; exclude?: string[]},
    methodName: string,
    allowed: boolean,
    statusCode: number,
    local: ILocal,
    methodIdFn: (name: string) => string,
    methodPartsFn: (name: string) => string,
): Promise<void> {
    // Route-level opt-out (e.g. operations that audit themselves).
    if (request.routeOptions.config.audit === false) return;
    const methodIdName = methodIdFn(methodName);
    if (AUDIT_HARD_EXCLUDE.includes(methodIdName)) return;
    const excluded = (audit.exclude ?? []).some(pattern => {
        if (pattern.endsWith('*')) return methodIdName.startsWith(pattern.slice(0, -1));
        return methodIdName === methodIdFn(pattern);
    });
    if (excluded) return;

    const handlerName = methodPartsFn(audit.handler);
    const reqName = `ports.${handlerName.split('.', 1)[0]}.request`;
    const handler = local.get(reqName);
    if (!handler) return;

    const credentials = (request.auth?.credentials ?? {}) as {
        actorId?: string;
        sessionId?: string;
    };
    const forwarded = (request.headers['x-forwarded-for'] ?? '') as string | string[];
    const ipAddress =
        ([] as string[]).concat(forwarded)[0]?.split(',')[0] || request.socket.remoteAddress || '';
    const params = (request.body as {params?: unknown} | undefined)?.params;
    const detail = auditDetail(methodName, params);
    const result = (await handler.method(
        {
            audit: [
                {
                    actorId: credentials.actorId,
                    sessionId: credentials.sessionId,
                    actionName: methodName,
                    isSuccess: allowed,
                    statusCode,
                    ipAddress,
                    ...(detail && {detail}),
                },
            ],
        },
        {
            method: handlerName,
            mtid: 'request',
            auth: credentials,
            ipAddress,
            httpRequest: {url: request.raw?.url || request.url},
        },
    )) as {auditIds?: string[]} | undefined;
    // Expose the inserted audit record key on the request auth — the gateway's
    // `_meta()` spreads `req.auth.credentials` into the handler `$meta.auth`, so
    // the audited handler sees it as `$meta.auth.auditId`.
    const auditId = result?.auditIds?.[0];
    if (auditId && request.auth) {
        request.auth.credentials = {...request.auth.credentials, auditId};
    }
}

export default fp<{
    cache: object | false;
    audience: string;
    verify: IGatewayCodec['verify'];
    errors: Errors<object>;
    authorize?: string;
    audit?: {handler: string; exclude?: string[]};
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
            audit,
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
            fastify.addHook('preHandler', async function (request, _reply) {
                // Routes with auth: false or auth: 'login' don't go through bearer auth,
                // so credentials have no actions. Skip the authorization check.
                if (
                    !request.routeOptions.config.auth ||
                    request.routeOptions.config.auth === 'login'
                ) {
                    return;
                }
                // Self-service methods (e.g. logout) are bearer-authenticated but
                // operate only on the caller's own session — no RBAC action needed.
                if (request.routeOptions.config.skipAuthorize) {
                    return;
                }
                // The authorize handler itself must be accessible without authorization,
                // otherwise we have a chicken-and-egg problem — you'd need authorization
                // to call the handler that resolves authorization.
                const methodName = request.routeOptions.config.methodName;
                if (authorize && methodName && methodParts) {
                    const normalizedMethod = methodParts(authorize);
                    if (methodName === normalizedMethod) {
                        return;
                    }
                }
                const credentials = request.auth?.credentials;
                if (!credentials?.actions) {
                    throw new Error('Authorization denied: no actions resolved');
                }
                if (!methodName) {
                    return; // no method configured — allow (backward compat)
                }
                const requestedId = methodId(methodName);
                const allowed = credentials.actions.includes(requestedId);
                // Record the access decision along with the access check — applies to
                // every operation controlled through it.  Best-effort (an audit failure
                // must never fail the request) but awaited so the inserted `auditId`
                // lands on `request.auth.credentials.auditId` (→ `$meta.auth.auditId`)
                // before the business handler runs.
                if (audit && methodName && local && methodId && methodParts) {
                    try {
                        await recordAccessAudit(
                            request,
                            audit,
                            methodName,
                            allowed,
                            allowed ? 200 : 403,
                            local,
                            methodId,
                            methodParts,
                        );
                    } catch {
                        // ignore — audit is best-effort
                    }
                }
                if (!allowed) {
                    const error = new Error(
                        `Authorization denied: method "${methodName}" not allowed`,
                    ) as Error & {statusCode: number};
                    error.statusCode = 403;
                    throw error;
                }
            });
        }

        await fastify.register(cookie, {});
        fastify.decorateRequest('auth');
        fastify.decorateReply('unstate', function (name: string, options?: unknown) {
            return this.clearCookie(name, options as {path?: string});
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
