import {type IMeta, handler} from '@feasibleone/blong';

import * as model from './accessModel.ts';
import {type AclHost} from './accessModel.ts';
import * as account from './account.ts';

type KnexQb = any;

/** Default inactivity timeout (seconds) when the caller does not supply one. */
const DEFAULT_INACTIVITY_TIMEOUT = 30 * 60;

/** Predicates that act on a single record and therefore need its key. */
const SINGLE_RECORD_PREDICATES = new Set(['get', 'edit', 'remove']);

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
 * **The action is also re-validated.**  With `action` (default `$meta.method`)
 * the action is checked against the **live** `core_path`
 * (`access.effectiveAction`) rather than the `per` map baked into the token, so
 * an action revoked since the token was issued is refused with
 * `access.acl.notPermitted` (`reason: 'actionNotPermitted'`).
 *
 * **A guarded entity additionally requires the record.**  When the action
 * belongs to an entity that opts into the record-level ACL, `get`/`edit`/`remove`
 * need `record` and `add` needs `scope` — a caller that forgets the key fails
 * with `acl.notPermitted` (`reason: 'recordRequired'` / `'scopeRequired'`)
 * instead of passing silently.  The key is then checked against the effective
 * ACL, throwing `acl.denied` / `acl.scopeDenied`.
 *
 * Wire: `access.session.verify`.
 */
export default handler(({errors}) => ({
    async accessSessionVerify(
        params: {
            sessionId?: string;
            touch?: boolean;
            /** Inactivity timeout in seconds (default 30 min). */
            inactivityTimeout?: number;
            /** Action to re-validate — defaults to `$meta.method`. */
            action?: string;
            /** The guarded record (`get` / `edit` / `remove` on a guarded entity). */
            record?: {entity?: string; recordId: string};
            /** The scope a new record is created in (`add` on a guarded entity). */
            scope?: {entity?: string; recordId: string};
        },
        $meta: IMeta,
    ): Promise<{
        sessionId: string;
        /** Dashed UUID of the stored bytes — usable by `access.permission.list`. */
        userId: string;
        /** SHA-256 hex of the current refresh token (for reuse detection). */
        tokenHash?: string;
        /** The record-level verdict, when the action belongs to a guarded entity. */
        acl?: {guarded: boolean; allowed: boolean; entity?: string; predicate?: string};
    }> {
        const qb: KnexQb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const sessionId =
            params.sessionId ?? ($meta?.auth as {sessionId?: string} | undefined)?.sessionId;
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
        // ── Live action + record gates ────────────────────────────────────
        // The JWT stays authoritative until it expires, so a critical
        // operation re-checks the action against the live permission paths
        // and then the record ACL (details in the handler doc above).
        const adapter = this as unknown as AclHost;
        const verdict = await adapter.aclCheck(
            {
                method: params.action ?? $meta?.method,
                recordId: params.record?.recordId,
                scopeIds: params.scope ? [params.scope.recordId] : undefined,
            },
            $meta,
        );
        if (verdict.actionId) {
            const effective = await qb
                .select('p.pathType')
                .from('core_path as p')
                .where('p.originId', session.userId)
                .where('p.destinationId', verdict.actionId)
                .where('p.pathType', 'access.effectiveAction')
                .first();
            if (!effective) {
                throw errors.aclNotPermitted({params: {reason: 'actionNotPermitted'}});
            }
        }
        if (verdict.guarded) {
            const predicate = verdict.predicate ?? '';
            if (SINGLE_RECORD_PREDICATES.has(predicate) && !params.record) {
                throw errors.aclNotPermitted({params: {reason: 'recordRequired'}});
            }
            if (predicate === 'add' && !params.scope) {
                throw errors.aclNotPermitted({params: {reason: 'scopeRequired'}});
            }
            if (!verdict.allowed) {
                throw params.scope
                    ? errors.aclScopeDenied({params: {reason: 'scopeDenied'}})
                    : errors.aclDenied({params: {reason: 'denied'}});
            }
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
            ...(verdict.guarded && {
                acl: {
                    guarded: true,
                    allowed: verdict.allowed,
                    entity: verdict.entity,
                    predicate: verdict.predicate,
                },
            }),
        };
    },
}));
