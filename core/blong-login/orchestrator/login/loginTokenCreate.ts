import {type IMeta, handler} from '@feasibleone/blong';
import crypto from 'node:crypto';

import {
    type ITokenResult,
    type SessionConfig,
    SESSION_COOKIE_DEFAULT,
} from './sessionLib.ts';

type CredentialCheckResult = {
    userId: string;
    userKey: string;
    credentialId: number;
    permissionMap: string;
    actions: string[];
};

type ClientCredentialCheckResult = {
    applicationId: string;
    isActive: boolean;
    applicationKey: string;
    credentialId: number;
    permissionMap: string;
    actions: string[];
};

/**
 * OAuth token endpoint (JSON-RPC `login.token.create`).
 *
 * Supports two grant types:
 * - `password` (default) — resource-owner password flow via `access.credential.check`.
 * - `client_credentials` — verifies an application's clientId/clientSecret via
 *   `access.credential.checkClient` and mints a standard JWT whose `per` carries
 *   the application's subscribed bundle roleBits.  Authorization is then uniform
 *   in the gateway jwt plugin (the same `access.authorization.list` as users).
 *
 * On success a DB-backed session is created (`access.session.create`), the JWT
 * `ses` claim carries its real id, an opaque restore cookie is set (password
 * grant, path-scoped to the restore endpoint) and the login event is recorded
 * in the audit.  Failures are audited too (success=false) then re-thrown.
 */
export default handler(
    ({errors, config, lib: {methods = {}, token, sessionCookieOptions, newCookieHandle, sha256Hex}}) => {
        const sessionConfig = config as SessionConfig;
        const SESSION_COOKIE = sessionConfig.session?.cookieName ?? SESSION_COOKIE_DEFAULT;
        return async function loginTokenCreate(
            {
                grantType = 'password',
                username,
                password,
                clientId,
                clientSecret,
            }: {
                grantType?: 'password' | 'client_credentials';
                username?: string;
                password?: string;
                clientId?: string;
                clientSecret?: string;
            },
            $meta: IMeta,
        ) {
            const ipAddress = ($meta as {ipAddress?: string}).ipAddress;
            const cookieOptions = sessionCookieOptions(sessionConfig);
            const recordAudit = (
                entry: {
                    userId?: string;
                    actorId?: string;
                    credentialType?: string;
                    isSuccess: boolean;
                    failureReason?: string;
                    sessionId?: string;
                },
            ) =>
                methods.auditRecord
                    ? (
                          methods.auditRecord(
                              {
                                  audit: [
                                      {
                                          ...entry,
                                          actionName: 'login',
                                          credentialType:
                                              entry.credentialType ??
                                              (grantType === 'client_credentials'
                                                  ? 'clientSecret'
                                                  : 'password'),
                                          ipAddress,
                                          statusCode: entry.isSuccess ? 200 : 401,
                                      },
                                  ],
                              },
                              $meta,
                          ) as Promise<{inserted: number}>
                      ).catch(() => undefined)
                    : Promise.resolve(undefined);

            if (grantType === 'client_credentials') {
                if (!methods.credentialCheckClient) {
                    throw errors['login.configurationError']({params: {method: 'credentialCheckClient'}});
                }
                let result: ClientCredentialCheckResult;
                try {
                    result = (await methods.credentialCheckClient(
                        {clientId: clientId!, clientSecret: clientSecret!},
                        // Forward $meta for tracing – the handler proxy attaches
                        // the method name and routing info automatically.
                        $meta,
                    )) as ClientCredentialCheckResult;
                } catch (error) {
                    await recordAudit({
                        actorId: clientId!,
                        isSuccess: false,
                        failureReason: (error as {type?: string}).type,
                    });
                    throw error;
                }
                await recordAudit({
                    actorId: result.applicationId,
                    isSuccess: true,
                });
                const sessionId = crypto.randomUUID();
                const tokenResult = (await token({
                    clientId: clientId!,
                    actorId: result.applicationId,
                    sessionId,
                    language: 'en',
                    refresh: '',
                    permissionMap: result.permissionMap,
                    mlek: $meta?.auth?.mlek,
                    mlsk: $meta?.auth?.mlsk,
                    actions: result.actions,
                })) as ITokenResult;
                // App tokens (client_credentials) are long-lived machine
                // credentials — no interactive session is created (no refresh
                // rotation, inactivity tracking or restore cookie applies).
                return tokenResult;
            }

            if (!methods.credentialCheck) {
                throw errors['login.configurationError']({params: {method: 'credentialCheck'}});
            }
            let result: CredentialCheckResult;
            try {
                result = (await methods.credentialCheck(
                    {username: username!, password: password!},
                    // Forward $meta for tracing – the handler proxy attaches
                    // the method name and routing info automatically.
                    $meta,
                )) as CredentialCheckResult;
            } catch (error) {
                await recordAudit({
                    actorId: username!,
                    isSuccess: false,
                    failureReason: (error as {type?: string}).type,
                });
                throw error;
            }

            // Login-eligibility gate (role-based): the user must hold the
            // `accessLogin` action (via role → capability → action).  Removing
            // it from a role disables logins for that role.
            if (!result.actions?.includes('accessLogin')) {
                await recordAudit({
                    actorId: username!,
                    isSuccess: false,
                    failureReason: 'login.loginNotAllowed',
                });
                throw errors['login.loginNotAllowed']();
            }

            const sessionId = crypto.randomUUID();
            const cookieHandle = newCookieHandle();
            const tokenResult = (await token({
                clientId: username!,
                actorId: result.userId,
                sessionId,
                language: 'en',
                refresh: '',
                permissionMap: result.permissionMap,
                mlek: $meta?.auth?.mlek,
                mlsk: $meta?.auth?.mlsk,
                actions: result.actions,
            })) as ITokenResult;
            if (methods.sessionCreate) {
                await (methods.sessionCreate(
                    {
                        userId: result.userKey,
                        credentialId: result.credentialId,
                        tokenHash: sha256Hex(tokenResult.refresh_token),
                        expiresAt: new Date(Date.now() + tokenResult.refresh_token_expires_in * 1000),
                        ipAddress,
                        sessionId,
                        cookieHash: sha256Hex(cookieHandle),
                    },
                    $meta,
                ) as Promise<{sessionId: string; userId: string}>);
            }
            if (methods.sessionCleanup) {
                await (methods.sessionCleanup({}, $meta) as Promise<{deleted: number}>).catch(
                    () => undefined,
                );
            }
            await recordAudit({
                userId: result.userKey,
                sessionId,
                isSuccess: true,
            });
            // Set the restore cookie via $meta.httpResponse (the codebase
            // pattern — the gateway applies it as Set-Cookie on the response).
            $meta.httpResponse = {
                state: [[SESSION_COOKIE, cookieHandle, cookieOptions]],
            };
            return tokenResult;
        };
    },
);
