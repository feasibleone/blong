import {type IMeta, handler} from '@feasibleone/blong';

import * as model from './accessModel.ts';

type KnexQb = any;

/** The `access.session.close` action id as carried in `$meta.auth.actions`. */
const CLOSE_ACTION_ID = 'access.session.close'.toLowerCase().replaceAll('.', '');

/**
 * `access.session.close` — revoke a session.
 *
 * Custom action wired to the "Close Session" toolbar button on the session
 * browse page, and called by `login.token.revoke` (logout).  Sessions are
 * standalone rows (`access_session`), not resource-backed; closing marks the
 * row `isRevoked` + `revokedAt` and clears the restore-cookie hash.
 *
 * Closing the caller's OWN session (the id in `$meta.auth.sessionId`, from the
 * JWT `ses` claim) needs only a valid token.  When no explicit `sessionId` is
 * given the CURRENT session is closed (same as passing your own id).  Closing
 * any OTHER session — an arbitrary id, or by `userId` — requires the
 * `access.session.close` action; otherwise the operation is refused (403).
 *
 * Revocation does NOT immediately invalidate already-issued access tokens
 * (those are authorized by the JWT alone until they expire).  Renewal is
 * refused because `login.token.refresh` / `access.session.verify` reject
 * revoked sessions.
 */
export default handler(({errors}) => ({
    async accessSessionClose(
        params: {sessionId?: string; userId?: string},
        $meta: IMeta,
    ): Promise<{success: boolean}> {
        const auth = $meta?.auth;
        // Target: an explicit session id, else the caller's CURRENT session
        // (the JWT `ses` claim).  Closing your own session needs no permission
        // — a valid token suffices.
        const targetSessionId = params.sessionId ?? auth?.sessionId;
        const ownSession = Boolean(
            targetSessionId && auth?.sessionId && targetSessionId === auth.sessionId,
        );
        if (!ownSession) {
            const hasAction = (auth?.actions ?? []).some(
                action => action.toLowerCase().replaceAll('.', '') === CLOSE_ACTION_ID,
            );
            if (!hasAction) throw errors.sessionCloseForbidden();
        }
        const qb: KnexQb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const q = qb('access_session').update({
            isRevoked: 1,
            revokedAt: new Date(),
            cookieHash: null,
        });
        if (targetSessionId) {
            const hex = model.binHex(targetSessionId);
            if (!hex) return {success: false};
            await q.where('sessionId', Buffer.from(hex, 'hex'));
        } else if (params.userId) {
            const userHex = model.binHex(params.userId);
            if (!userHex) return {success: false};
            await q.where('userId', Buffer.from(userHex, 'hex'));
        } else {
            return {success: false};
        }
        return {success: true};
    },
}));
