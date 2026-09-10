import {type IMeta, handler} from '@feasibleone/blong';

import {
    type SessionConfig,
    SESSION_COOKIE_DEFAULT,
    SESSION_COOKIE_PATH_DEFAULT,
} from './sessionLib.ts';

/**
 * Logout endpoint (JSON-RPC `login.token.revoke`).
 *
 * Revokes the caller's session (`access.session.close`) and clears the
 * restore cookie.  Already-issued access tokens remain valid until they
 * expire — renewal is what refuses revoked sessions — so this is the
 * "closing a session leaves an active token for up to the refresh interval"
 * behaviour.  Critical operations that must not run on a closed session call
 * `access.session.verify` explicitly.
 *
 * Authenticated (bearer) route — the session id comes from `$meta.auth.sessionId`
 * unless explicitly passed.
 *
 * Wire: `login.token.revoke`.
 */
export default handler(
    ({config, lib: {methods = {}}}) => {
        const sessionConfig = config as SessionConfig;
        const SESSION_COOKIE = sessionConfig.session?.cookieName ?? SESSION_COOKIE_DEFAULT;
        const SESSION_COOKIE_PATH = sessionConfig.session?.cookiePath ?? SESSION_COOKIE_PATH_DEFAULT;
        return async function loginTokenRevoke({sessionId}: {sessionId?: string}, $meta: IMeta) {
            const auth = ($meta as {auth?: {sessionId?: string; actorId?: string}}).auth;
            const targetSessionId = sessionId ?? auth?.sessionId;
            if (targetSessionId && methods.sessionClose) {
                await (methods.sessionClose(
                    {sessionId: targetSessionId},
                    $meta,
                ) as Promise<{success: boolean}>);
            }
            if (methods.sessionCleanup) {
                await (methods.sessionCleanup({}, $meta) as Promise<{deleted: number}>).catch(
                    () => undefined,
                );
            }
            if (methods.auditRecord) {
                await (
                    methods.auditRecord(
                        {
                            audit: [
                                {
                                    actorId: auth?.actorId,
                                    sessionId: targetSessionId,
                                    actionName: 'logout',
                                    ipAddress: ($meta as {ipAddress?: string}).ipAddress,
                                    isSuccess: true,
                                    statusCode: 200,
                                },
                            ],
                        },
                        $meta,
                    ) as Promise<{inserted: number}>
                ).catch(() => undefined);
            }
            // Clear the path-scoped restore cookie via $meta.httpResponse.
            $meta.httpResponse = {
                unstate: [[SESSION_COOKIE, {path: SESSION_COOKIE_PATH}]],
            };
            return {success: true};
        };
    },
);
