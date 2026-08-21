import {type IMeta, handler} from '@feasibleone/blong';

import {
    type ITokenResult,
    type SessionConfig,
    SESSION_COOKIE_DEFAULT,
} from './sessionLib.ts';

/**
 * Session-restore endpoint (JSON-RPC `login.token.restore`, `auth: 'login'`).
 *
 * Lets the UI skip the login screen on reload when a live session exists.
 * The restore cookie is HttpOnly + Secure + SameSite=Lax and Path-scoped to
 * this URL ONLY — it is never sent to other endpoints and cannot be read by
 * JavaScript.  It carries an opaque random handle (only its SHA-256 digest is
 * stored on the session row), which is exchanged here for fresh tokens:
 *  1. read the cookie → `access.session.restore` validates the session
 *     (not revoked / not expired / not inactive, user active + `accessLogin`
 *     eligibility) and touches activity,
 *  2. `access.permission.list` re-resolves the CURRENT permission set,
 *  3. fresh access + refresh tokens are minted, a NEW cookie handle is
 *     issued (rotation — a captured cookie cannot be reused) and the token
 *     hash is rotated via `access.session.restore`.
 *
 * Wire: `login.token.restore`.
 */
export default handler(
    ({
        errors,
        config,
        lib: {
            methods = {},
            token,
            crockfordEncode,
            sessionCookieOptions,
            newCookieHandle,
            readSessionCookie,
            sha256Hex,
        },
    }) => {
        const sessionConfig = config as SessionConfig;
        const SESSION_COOKIE = sessionConfig.session?.cookieName ?? SESSION_COOKIE_DEFAULT;
        const inactivityTimeout = sessionConfig.expire?.inactivity;
        return async function loginTokenRestore(params: Record<string, never>, $meta: IMeta) {
            const ipAddress = ($meta as {ipAddress?: string}).ipAddress;
            const cookieHandle = readSessionCookie($meta, SESSION_COOKIE);
            const cookieOptions = sessionCookieOptions(sessionConfig);
            const recordAudit = (
                entry: {
                    actorId?: string;
                    sessionId?: string;
                    isSuccess: boolean;
                    failureReason?: string;
                },
            ) =>
                methods.auditRecord
                    ? (
                          methods.auditRecord(
                              {
                                  audit: [
                                      {
                                          ...entry,
                                          actionName: 'login.restore',
                                          ipAddress,
                                          statusCode: entry.isSuccess ? 200 : 401,
                                      },
                                  ],
                              },
                              $meta,
                          ) as Promise<{inserted: number}>
                      ).catch(() => undefined)
                    : Promise.resolve(undefined);

            if (!cookieHandle) {
                await recordAudit({isSuccess: false, failureReason: 'login.invalidCookie'});
                throw errors['login.invalidCookie']();
            }
            if (!methods.sessionRestore) {
                await recordAudit({
                    isSuccess: false,
                    failureReason: 'login.configurationError',
                });
                throw errors['login.configurationError']({params: {method: 'sessionRestore'}});
            }

            const newHandle = newCookieHandle();
            const check = (await methods.sessionRestore(
                {
                    cookieHash: sha256Hex(cookieHandle),
                    newCookieHash: sha256Hex(newHandle),
                    touch: true,
                    inactivityTimeout,
                },
                $meta,
            )) as {
                valid: boolean;
                reason?:
                    | 'notFound'
                    | 'revoked'
                    | 'expired'
                    | 'inactive'
                    | 'userInactive'
                    | 'loginNotAllowed';
                sessionId?: string;
                userId?: string;
                credentialId?: number;
            };
            if (!check.valid) {
                const reason = check.reason ?? 'notFound';
                const errorType =
                    reason === 'revoked'
                        ? 'login.sessionRevoked'
                        : reason === 'inactive'
                          ? 'login.sessionInactive'
                          : reason === 'expired'
                            ? 'login.sessionExpired'
                            : reason === 'userInactive'
                              ? 'login.userInactive'
                              : reason === 'loginNotAllowed'
                                ? 'login.loginNotAllowed'
                                : 'login.sessionNotFound';
                await recordAudit({isSuccess: false, failureReason: errorType});
                throw errors[errorType]();
            }
            const sessionId = check.sessionId!;
            // Same actorId format as login — crockford-encoded user key (JWT `sub`).
            const actorId = check.userId
                ? crockfordEncode(Buffer.from(check.userId.replace(/-/g, ''), 'hex'))
                : '';

            // Current permission set — no stale claims on a restored session.
            // Optional: without a configured `permissionList` (lightweight suite)
            // the restored token simply carries no permissions.
            let permissionMap = '';
            let actions: string[] = [];
            let isActive = true;
            if (methods.permissionList) {
                const resolved = (await methods.permissionList(
                    {userId: check.userId!},
                    $meta,
                )) as {permissionMap: string; actions: string[]; isActive: boolean};
                permissionMap = resolved.permissionMap;
                actions = resolved.actions;
                isActive = resolved.isActive;
            }

            // Login-eligibility gates on restore: a deactivated user — or one
            // who no longer holds the `accessLogin` action — cannot resume a
            // session via the cookie.
            if (methods.permissionList) {
                if (!isActive) {
                    await recordAudit({isSuccess: false, failureReason: 'login.userInactive'});
                    throw errors['login.userInactive']();
                }
                if (!actions.includes('accessLogin')) {
                    await recordAudit({isSuccess: false, failureReason: 'login.loginNotAllowed'});
                    throw errors['login.loginNotAllowed']();
                }
            }

            // Best-effort profile resolution so the UI can apply the user's
            // preferred language right after restore.  Optional — yields 'en'.
            let profile: {actorId?: string; language?: string} | undefined;
            let language = 'en';
            if (methods.profileGet) {
                try {
                    const profileData = (await methods.profileGet(
                        {},
                        {...$meta, auth: {...$meta.auth, actorId}},
                    )) as {preferredLanguage?: string | null} | undefined;
                    language = profileData?.preferredLanguage ?? 'en';
                    profile = {actorId, language};
                } catch {
                    // Profile is optional restore metadata — never fails the restore.
                }
            }

            const tokenResult = (await token({
                clientId: '',
                actorId,
                sessionId,
                language,
                refresh: '',
                permissionMap,
                mlek: $meta?.auth?.mlek,
                mlsk: $meta?.auth?.mlsk,
                actions,
                profile,
            })) as ITokenResult;
            if (methods.sessionCleanup) {
                await (methods.sessionCleanup({}, $meta) as Promise<{deleted: number}>).catch(
                    () => undefined,
                );
            }
            await recordAudit({actorId, sessionId, isSuccess: true});
            // Rotate the restore cookie (one-time use) via $meta.httpResponse.
            $meta.httpResponse = {
                state: [[SESSION_COOKIE, newHandle, cookieOptions]],
            };
            return tokenResult;
        };
    },
);
