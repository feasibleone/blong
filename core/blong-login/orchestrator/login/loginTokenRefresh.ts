import {type IMeta, handler} from '@feasibleone/blong';

import {type ITokenResult, type SessionConfig} from './sessionLib.ts';

/**
 * OAuth refresh-grant endpoint (JSON-RPC `login.token.refresh`).
 *
 * Redeems the CBC-encrypted refresh token minted at login:
 *  1. `readRefresh` decrypts + checks its own expiry (→ `login.refreshTokenExpired`).
 *  2. `access.session.verify` checks the DB session is live (not revoked /
 *     expired / inactive) and TOUCHES `lastActivityAt` — renewing updates the
 *     inactivity timer.
 *  3. `access.permission.list` re-resolves the user's effective role bits and
 *     actions from the materialized `core_path` — so a renewed token carries
 *     the CURRENT permission set (role/capability/action changes take effect
 *     on the next refresh without a re-login).
 *  4. `token()` mints a fresh access token + a rotated refresh token, and
 *     `access.session.rotate` stores the new refresh-token hash.
 *
 * A revoked / inactive / expired session refuses renewal — the still-valid
 * access token keeps working until it expires, but cannot be renewed, so the
 * client is effectively logged out within one access-token lifetime.
 *
 * Wire: `login.token.refresh` (`auth: 'login'`).
 */
export default handler(
    ({errors, config, lib: {methods = {}, readRefresh, token, sha256Hex}}) => {
        const inactivityTimeout = (config as SessionConfig).expire?.inactivity;
        return async function loginTokenRefresh(
            {refreshToken}: {refreshToken: string},
            $meta: IMeta,
        ) {
            const ipAddress = ($meta as {ipAddress?: string}).ipAddress;
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
                                          actionName: 'login.refresh',
                                          ipAddress,
                                          statusCode: entry.isSuccess ? 200 : 401,
                                      },
                                  ],
                              },
                              $meta,
                          ) as Promise<{inserted: number}>
                      ).catch(() => undefined)
                    : Promise.resolve(undefined);

            let payload: {
                actorId: string;
                sessionId: string;
                clientId?: string;
                mlsk?: object | 'header';
                mlek?: object | 'header';
                refresh?: number;
                expire?: number;
                actions?: string[];
            };
            try {
                payload = readRefresh(refreshToken) as typeof payload;
            } catch (error) {
                await recordAudit({isSuccess: false, failureReason: 'login.refreshTokenExpired'});
                throw error;
            }
            if (!payload?.sessionId) {
                await recordAudit({
                    isSuccess: false,
                    failureReason: 'login.invalidRefreshToken',
                });
                throw errors['login.invalidRefreshToken']();
            }
            const {sessionId, actorId, clientId, mlsk, mlek} = payload;

            // Session verification is required for renewal — without it a
            // refresh cannot validate the session (lightweight suites disable
            // it and don't expose renewal).
            if (!methods.sessionVerify) {
                await recordAudit({
                    actorId,
                    sessionId,
                    isSuccess: false,
                    failureReason: 'login.configurationError',
                });
                throw errors['login.configurationError']({params: {method: 'sessionVerify'}});
            }
            let check: {sessionId: string; userId: string; tokenHash?: string};
            try {
                check = await (methods.sessionVerify(
                    {
                        sessionId,
                        touch: true,
                        inactivityTimeout,
                    },
                    $meta,
                ) as Promise<{sessionId: string; userId: string; tokenHash?: string}>);
            } catch (error) {
                // `access.session.verify` throws the specific `access.session.*`
                // error with the reason on `error.params.reason`; surface it as
                // the matching `login.*` error (the endpoint's public contract).
                const reason =
                    (error as {params?: {reason?: 'notFound' | 'revoked' | 'expired' | 'inactive' | 'userInactive' | 'loginNotAllowed'}})
                        .params?.reason ?? 'notFound';
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
                await recordAudit({actorId, sessionId, isSuccess: false, failureReason: errorType});
                throw errors[errorType]();
            }

            // Refresh-token reuse detection: the presented refresh token must
            // still be the CURRENT one.  A mismatch means the token was rotated
            // already (stolen/replayed) — revoke the session as a precaution.
            if (check.tokenHash && check.tokenHash !== sha256Hex<string>(refreshToken)) {
                if (methods.sessionClose) {
                    // The session bound to the presented refresh token is the caller's
                    // own — mark it as such so closing it (reuse protection) does not
                    // require the `access.session.close` permission.
                    await (methods.sessionClose(
                        {sessionId},
                        {...$meta, auth: {...$meta.auth, sessionId}},
                    ) as Promise<{success: boolean}>);
                }
                await recordAudit({
                    actorId,
                    sessionId,
                    isSuccess: false,
                    failureReason: 'login.invalidRefreshToken',
                });
                throw errors['login.invalidRefreshToken']();
            }

            // Fresh permission set — role/capability/action changes apply on renewal.
            // Optional: without a configured `permissionList` (lightweight suite)
            // the renewed token simply carries no permissions.
            let permissionMap = '';
            let actions: string[] = [];
            let isActive = true;
            if (methods.permissionList) {
                const resolved = (await methods.permissionList(
                    {userId: check.userId},
                    $meta,
                )) as {permissionMap: string; actions: string[]; isActive: boolean};
                permissionMap = resolved.permissionMap;
                actions = resolved.actions;
                isActive = resolved.isActive;
            }

            // Login-eligibility gates on renewal: a user who has since been
            // deactivated (`user.isActive = false`) or lost the `accessLogin`
            // action can no longer renew.  Their session dies within one
            // access-token lifetime instead of living on.
            if (methods.permissionList) {
                if (!isActive) {
                    await recordAudit({
                        actorId,
                        sessionId,
                        isSuccess: false,
                        failureReason: 'login.userInactive',
                    });
                    throw errors['login.userInactive']();
                }
                if (!actions.includes('accessLogin')) {
                    await recordAudit({
                        actorId,
                        sessionId,
                        isSuccess: false,
                        failureReason: 'login.loginNotAllowed',
                    });
                    throw errors['login.loginNotAllowed']();
                }
            }

            // Keep the session lifetime FIXED (absolute expiry from login): the
            // new refresh token expires at the same moment as the session.
            const remaining = payload.expire
                ? Math.max(0, Math.round((payload.expire - Date.now()) / 1000))
                : undefined;

            const tokenResult = (await token({
                clientId: clientId ?? '',
                actorId,
                sessionId,
                language: 'en',
                refresh: remaining ?? payload.refresh ?? 0,
                permissionMap,
                mlek,
                mlsk,
                actions,
            })) as ITokenResult;

            if (methods.sessionRotate) {
                await (methods.sessionRotate(
                    {sessionId, tokenHash: sha256Hex(tokenResult.refresh_token)},
                    $meta,
                ) as Promise<{success: boolean}>);
            }
            if (methods.sessionCleanup) {
                await (methods.sessionCleanup({}, $meta) as Promise<{deleted: number}>).catch(
                    () => undefined,
                );
            }
            await recordAudit({actorId, sessionId, isSuccess: true});
            return tokenResult;
        };
    },
);
