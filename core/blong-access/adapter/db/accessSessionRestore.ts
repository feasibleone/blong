import {type IMeta, handler} from '@feasibleone/blong';

import * as account from './account.ts';

type KnexQb = any;

/** Default inactivity timeout (seconds) when the caller does not supply one. */
const DEFAULT_INACTIVITY_TIMEOUT = 30 * 60;

/**
 * `access.session.restore` — validate an opaque restore-cookie handle.
 *
 * The cookie carries a random opaque handle (never the JWT).  Only its
 * SHA-256 hex digest is stored on the session row (`cookieHash`), so a leaked
 * database dump cannot be replayed as cookies.  The restore endpoint
 * (`login.token.restore`) calls this to exchange the handle for a live
 * session; the handle is then rotated (new handle + digest) so a captured
 * cookie cannot be reused.
 *
 * Validity rules mirror `access.session.verify` (exists / not revoked / not
 * expired / not inactive / user active / `accessLogin` eligibility), keyed by
 * `cookieHash` instead of `sessionId`.  An ineligible session is reported as
 * `{valid: false, reason: 'userInactive'}` / `'loginNotAllowed'` rather than
 * throwing (the restore endpoint maps those to its own 401 errors).
 *
 * Wire: `access.session.restore`.
 */
export default handler(() => ({
    async accessSessionRestore(
        params: {
            cookieHash: string;
            touch?: boolean;
            /** Inactivity timeout in seconds (default 30 min). */
            inactivityTimeout?: number;
            /** New cookie-handle digest to rotate to (one-time use cookies). */
            newCookieHash?: string;
        },
        $meta: IMeta,
    ): Promise<{
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
    }> {
        const qb: KnexQb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        if (!params.cookieHash) return {valid: false, reason: 'notFound'};
        const session = (await qb('access_session')
            .select('access_session.*', 'u.isActive as userIsActive')
            .leftJoin('access_user as u', 'u.userId', 'access_session.userId')
            .where('access_session.cookieHash', params.cookieHash)
            .first()) as
            | {
                  sessionId: Buffer;
                  userId: Buffer;
                  credentialId: number;
                  isRevoked: number | boolean;
                  expiresAt: Date;
                  lastActivityAt: Date;
                  userIsActive?: boolean | null;
              }
            | undefined;
        if (!session) return {valid: false, reason: 'notFound'};
        const now = Date.now();
        const inactivityTimeout = (params.inactivityTimeout ?? DEFAULT_INACTIVITY_TIMEOUT) * 1000;
        // MySQL rounds fractional seconds UP on datetime columns — add tolerance.
        const elapsed = now - new Date(session.lastActivityAt).getTime() + 1000;
        if (session.isRevoked) return {valid: false, reason: 'revoked'};
        if (new Date(session.expiresAt).getTime() <= now) return {valid: false, reason: 'expired'};
        if (elapsed > inactivityTimeout) {
            return {valid: false, reason: 'inactive'};
        }
        // Login-eligibility on the restore gate (mirrors `access.session.verify`):
        // a deactivated user — or one whose roles no longer grant the
        // `accessLogin` action — cannot resume the session via the cookie.
        if (!session.userIsActive) return {valid: false, reason: 'userInactive'};
        const loginAction = (await qb
            .select('res.resourceName')
            .from('core_resource as res')
            .join('core_path as p', 'p.destinationId', 'res.resourceId')
            .where('p.originId', session.userId)
            .where('p.pathType', 'access.effectiveAction')
            .where('res.resourceName', 'accessLogin')
            .first()) as {resourceName: string} | undefined;
        if (!loginAction) return {valid: false, reason: 'loginNotAllowed'};
        if (params.touch || params.newCookieHash) {
            await qb('access_session')
                .where('sessionId', session.sessionId)
                .update({
                    ...(params.touch && {lastActivityAt: new Date(now)}),
                    ...(params.newCookieHash && {cookieHash: params.newCookieHash}),
                });
        }
        return {
            valid: true,
            sessionId: account.bufToUuid(session.sessionId),
            // Dashed UUID of the stored bytes — directly usable by
            // `access.permission.list` (`uuidBuf` round-trips to the DB order).
            userId: account.bufToUuid(session.userId),
            credentialId: session.credentialId,
        };
    },
}));
