import crypto from 'node:crypto';

import {library} from '@feasibleone/blong';

/** Default restore-cookie name (override via `login.session.cookieName`). */
export const SESSION_COOKIE_DEFAULT = 'blong.session';

/**
 * Default path-scope for the restore cookie — it is only sent to the restore
 * endpoint, so a captured cookie cannot be used against other URLs.
 * Override via `login.session.cookiePath`.
 */
export const SESSION_COOKIE_PATH_DEFAULT = '/rpc/login/token/restore';

/** SHA-256 hex digest — used for refresh-token and cookie-handle hashing. */
function sha256Hex(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
}

/** A fresh opaque cookie handle (128 bits of entropy, base64url). */
function newCookieHandle(): string {
    return crypto.randomBytes(16).toString('base64url');
}

/** Format a BINARY(16) Buffer as a dashed UUID string. */
function bufToUuid(buf: Buffer): string {
    const hex = buf.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Base64 (wire) binary key → dashed UUID string. */
function base64ToUuid(value: string): string {
    return bufToUuid(Buffer.from(value, 'base64'));
}

/** The token response shape returned by `login.token.*` endpoints. */
export interface ITokenResult {
    access_token: string;
    expires_in: number;
    refresh_token: string;
    refresh_token_expires_in: number;
    session_id: string;
    permissions: string[] | boolean;
}

/**
 * Access-realm methods that `blong-login` calls, made **configurable** so the
 * realm can run without blong-access (lightweight suites).  Each entry is a
 * wire name (default: the blong-access handler) or `false` to disable that
 * functionality.
 */
export type LoginMethodKey =
    | 'credentialCheck'
    | 'credentialCheckClient'
    | 'identityCheck'
    | 'permissionList'
    | 'sessionCreate'
    | 'sessionVerify'
    | 'sessionRestore'
    | 'sessionRotate'
    | 'sessionClose'
    | 'sessionCleanup'
    | 'auditRecord';

export type LoginMethods = Partial<Record<LoginMethodKey, string | false>>;

/** Default wire names — the blong-access handlers. */
export const LOGIN_METHOD_DEFAULTS: Record<LoginMethodKey, string> = {
    credentialCheck: 'access.credential.check',
    credentialCheckClient: 'access.credential.checkClient',
    identityCheck: 'access.identity.check',
    permissionList: 'access.permission.list',
    sessionCreate: 'access.session.create',
    sessionVerify: 'access.session.verify',
    sessionRestore: 'access.session.restore',
    sessionRotate: 'access.session.rotate',
    sessionClose: 'access.session.close',
    sessionCleanup: 'access.session.cleanup',
    auditRecord: 'access.audit.record',
};

/**
 * Resolve one configured login method against the handler proxy — the
 * `login.methods.*` override wins, otherwise the blong-access default applies.
 * Returns `undefined` when the method is explicitly disabled (`false`); the
 * caller then skips that functionality.  Throws when the configured name does
 * not resolve to a registered handler (a typo must not silently disable it).
 */
export function resolveLoginMethod(
    config: {methods?: LoginMethods},
    key: LoginMethodKey,
    handler: Record<string, unknown>,
): ((...args: unknown[]) => unknown) | undefined {
    const name = config.methods?.[key] ?? LOGIN_METHOD_DEFAULTS[key];
    if (!name) return undefined;
    const fn = (handler as Record<string, unknown>)[name];
    if (typeof fn !== 'function') {
        throw new Error(
            `login.methods.${key} refers to unknown method '${name}' — configure a handler or set it to false`,
        );
    }
    return fn as (...args: unknown[]) => unknown;
}

/** A single resolved (bound) login method — `undefined` when disabled. */
export type ResolvedLoginMethod = ((...args: unknown[]) => unknown) | undefined;

/** All access-methods resolved once by the `sessionLib` library factory. */
export interface ResolvedLoginMethods {
    credentialCheck?: ResolvedLoginMethod;
    credentialCheckClient?: ResolvedLoginMethod;
    identityCheck?: ResolvedLoginMethod;
    permissionList?: ResolvedLoginMethod;
    sessionCreate?: ResolvedLoginMethod;
    sessionVerify?: ResolvedLoginMethod;
    sessionRestore?: ResolvedLoginMethod;
    sessionRotate?: ResolvedLoginMethod;
    sessionClose?: ResolvedLoginMethod;
    sessionCleanup?: ResolvedLoginMethod;
    auditRecord?: ResolvedLoginMethod;
}

/** Session-relevant `login` config consumed by the `sessionLib` library. */
export interface SessionConfig {
    methods?: LoginMethods;
    expire?: {cookie?: number; inactivity?: number};
    session?: {
        cookieName?: string;
        cookiePath?: string;
        isSecure?: boolean;
        isHttpOnly?: boolean;
    };
}

/** Cookie options for the restore cookie. */
export type SessionCookieOptions = {
    ttl: number;
    isSecure: boolean;
    isHttpOnly: boolean;
    isSameSite: 'lax';
    path: string;
};

/**
 * Cookie options for the restore cookie, computed from config — a suite can
 * override the defaults via `login.session.*` / `login.expire.cookie`.
 */
function sessionCookieOptions(config: SessionConfig): SessionCookieOptions {
    return {
        ttl: (config.expire?.cookie ?? 8 * 60 * 60) * 1000,
        isSecure: config.session?.isSecure ?? true,
        isHttpOnly: config.session?.isHttpOnly ?? true,
        isSameSite: 'lax',
        path: config.session?.cookiePath ?? SESSION_COOKIE_PATH_DEFAULT,
    };
}

/** Read the restore cookie value from `$meta.httpRequest.state` (cookies). */
function readSessionCookie($meta: unknown, cookieName: string): string | undefined {
    const httpRequest = ($meta as {httpRequest?: {state?: Record<string, string>}})?.httpRequest;
    return httpRequest?.state?.[cookieName];
}

/**
 * `sessionLib` — the login group's configurable-bindings library (see the
 * blong-handler skill → "Library as a configurable-bindings bundle").
 *
 * The factory runs ONCE at layer assembly and resolves every configurable
 * access-realm method against the `handler` proxy into the conventional
 * `methods` map — soft dependencies a suite can override or disable via
 * `login.methods.*`.  The rest are pure helpers (cookie-options construction,
 * hashing, cookie reading).  Cookie/session CONSTANTS are deliberately NOT
 * re-exported here — handlers read them straight from `config`.
 *
 *     const {methods, sha256Hex, sessionCookieOptions} = lib;
 *     methods.auditRecord?.({...}, $meta);
 *     const hash = sha256Hex<string>(refreshToken);
 */
export default library(
    ({config, handler}) => {
        const methods: ResolvedLoginMethods = {
            credentialCheck: resolveLoginMethod(config, 'credentialCheck', handler),
            credentialCheckClient: resolveLoginMethod(config, 'credentialCheckClient', handler),
            identityCheck: resolveLoginMethod(config, 'identityCheck', handler),
            permissionList: resolveLoginMethod(config, 'permissionList', handler),
            sessionCreate: resolveLoginMethod(config, 'sessionCreate', handler),
            sessionVerify: resolveLoginMethod(config, 'sessionVerify', handler),
            sessionRestore: resolveLoginMethod(config, 'sessionRestore', handler),
            sessionRotate: resolveLoginMethod(config, 'sessionRotate', handler),
            sessionClose: resolveLoginMethod(config, 'sessionClose', handler),
            sessionCleanup: resolveLoginMethod(config, 'sessionCleanup', handler),
            auditRecord: resolveLoginMethod(config, 'auditRecord', handler),
        };
        return {
            /** Conventional map of resolved access-method bindings. */
            methods,
            sha256Hex,
            newCookieHandle,
            sessionCookieOptions,
            readSessionCookie,
            bufToUuid,
            base64ToUuid,
        };
    },
);
