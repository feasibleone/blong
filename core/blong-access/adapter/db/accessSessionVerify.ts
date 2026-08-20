import {type IMeta, handler} from '@feasibleone/blong';

import * as account from './account.ts';
import * as model from './accessModel.ts';

type KnexQb = any;

/** Default inactivity timeout (seconds) when the caller does not supply one. */
const DEFAULT_INACTIVITY_TIMEOUT = 30 * 60;

/**
 * `access.session.verify` — the standard method for checking that a session
 * is still live.  Throws an auth-classified (401) error when it is not.
 *
 * Normal gateway requests are authorized by the JWT alone (fast path) and do
 * NOT hit the database.  Operations that need a stronger guarantee — e.g. DB
 * writes, sensitive transfers — should call this method explicitly at the
 * start of the handler:
 *
 * ```ts
 * const {userId} = await handler.accessSessionVerify({}, $meta); // throws on invalid
 * ```
 *
 * On an invalid session it throws one of:
 *  - `access.session.notFound`  — no session row (or no `$meta.auth.sessionId`)
 *  - `access.session.revoked`   — session closed/logged out
 *  - `access.session.expired`   — past `expiresAt` (refresh-token lifetime)
 *  - `access.session.inactive`  — idle past the inactivity timeout
 *  - `access.session.userInactive`  — the session's user has been deactivated
 *  - `access.session.loginNotAllowed` — the user's roles no longer grant the
 *    `accessLogin` action (login-eligibility enforced at the session gate too)
 *
 * The failing reason is available on `error.params.reason` (`notFound` /
 * `revoked` / `expired` / `inactive` / `userInactive` / `loginNotAllowed`) for
 * callers that need to branch or re-throw a realm-specific error.  On success it
 * returns the session data (the session id defaults to `$meta.auth.sessionId`,
 * the JWT `ses` claim).  With `touch: true` the `lastActivityAt` timestamp is
 * updated, which resets the inactivity timer for the session.
 *
 * Wire: `access.session.verify`.
 */
export default handler(
    ({errors}) => ({
        async accessSessionVerify(
            params: {
                sessionId?: string;
                touch?: boolean;
                /** Inactivity timeout in seconds (default 30 min). */
                inactivityTimeout?: number;
            },
            $meta: IMeta,
        ): Promise<{
            sessionId: string;
            /** Dashed UUID of the stored bytes — usable by `access.permission.list`. */
            userId: string;
            /** SHA-256 hex of the current refresh token (for reuse detection). */
            tokenHash?: string;
        }> {
            const qb: KnexQb = this.config?.context?.queryBuilder;
            if (!qb) throw new Error('Database not available');
            const sessionId = params.sessionId ?? ($meta?.auth as {sessionId?: string} | undefined)?.sessionId;
            const hex = model.binHex(sessionId as Buffer | string | undefined);
            if (!hex) throw errors.sessionNotFound({params: {reason: 'notFound'}});
            const session = (await qb('access_session')
                .select('access_session.*', 'u.isActive as userIsActive')
                .leftJoin('access_user as u', 'u.userId', 'access_session.userId')
                .where('access_session.sessionId', Buffer.from(hex, 'hex'))
                .first()) as
                | {
                      sessionId: Buffer;
                      userId: Buffer;
                      isRevoked: number | boolean;
                      expiresAt: Date;
                      lastActivityAt: Date;
                      tokenHash: string;
                      userIsActive?: boolean | null;
                  }
                | undefined;
            if (!session) throw errors.sessionNotFound({params: {reason: 'notFound'}});
            const now = Date.now();
            const inactivityTimeout = (params.inactivityTimeout ?? DEFAULT_INACTIVITY_TIMEOUT) * 1000;
            // MySQL rounds fractional seconds UP on datetime columns, so `lastActivityAt`
            // can be stored up to ~1 s in the future — add that tolerance before comparing.
            const elapsed = now - new Date(session.lastActivityAt).getTime() + 1000;
            if (session.isRevoked) throw errors.sessionRevoked({params: {reason: 'revoked'}});
            if (new Date(session.expiresAt).getTime() <= now)
                throw errors.sessionExpired({params: {reason: 'expired'}});
            if (elapsed > inactivityTimeout) {
                throw errors.sessionInactive({params: {reason: 'inactive'}});
            }
            // Login-eligibility on the session gate: a user who has been deactivated
            // — or whose roles no longer grant the `accessLogin` action — cannot hold
            // a live session, so critical operations refuse even while the session row
            // itself looks live.
            if (!session.userIsActive) {
                throw errors.sessionUserInactive({params: {reason: 'userInactive'}});
            }
            const loginAction = (await qb
                .select('res.resourceName')
                .from('core_resource as res')
                .join('core_path as p', 'p.destinationId', 'res.resourceId')
                .where('p.originId', session.userId)
                .where('p.pathType', 'access.effectiveAction')
                .where('res.resourceName', 'accessLogin')
                .first()) as {resourceName: string} | undefined;
            if (!loginAction) {
                throw errors.sessionLoginNotAllowed({params: {reason: 'loginNotAllowed'}});
            }
            if (params.touch) {
                await qb('access_session')
                    .where('sessionId', Buffer.from(hex, 'hex'))
                    .update({lastActivityAt: new Date(now)});
            }
            return {
                sessionId: sessionId as string,
                // Dashed UUID of the stored bytes — directly usable by
                // `access.permission.list` (`uuidBuf` round-trips to the DB order).
                userId: account.bufToUuid(session.userId),
                tokenHash: session.tokenHash,
            };
        },
    }),
);
