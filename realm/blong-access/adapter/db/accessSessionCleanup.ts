import {type IMeta, handler} from '@feasibleone/blong';

type KnexQb = any;

/** Default "delete after" interval (seconds) — sessions older than this are purged. */
const DEFAULT_DELETE_AFTER = 24 * 60 * 60;

/**
 * `access.session.cleanup` — purge stale sessions.
 *
 * Dialect-neutral (no stored procedure, no SQL date functions): the cutoff is
 * computed in JS and passed as a bound parameter.  A session row is deleted
 * when ANY of these hold (relative to `now - deleteAfter`):
 *  - revoked more than `deleteAfter` ago (`isRevoked = 1` and `revokedAt`
 *    before the cutoff),
 *  - inactive for more than `deleteAfter` (`lastActivityAt` before the
 *    cutoff),
 *  - expired (refresh-token lifetime passed) more than `deleteAfter` ago.
 *
 * Call it periodically (scheduled orchestrator) or lazily from the login /
 * refresh / restore flows to keep the table bounded.
 *
 * Wire: `access.session.cleanup`.
 */
export default handler(() => ({
    async accessSessionCleanup(
        params: {
            /** "Delete after" interval in seconds (default 24 h). */
            deleteAfter?: number;
        },
        $meta: IMeta,
    ): Promise<{deleted: number}> {
        const qb: KnexQb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const cutoff = new Date(Date.now() - (params.deleteAfter ?? DEFAULT_DELETE_AFTER) * 1000);
        const deleted = await qb('access_session')
            .where(function (this: KnexQb) {
                this.where('isRevoked', 1).andWhere('revokedAt', '<', cutoff);
            })
            .orWhere('lastActivityAt', '<', cutoff)
            .orWhere('expiresAt', '<', cutoff)
            .del();
        return {deleted};
    },
}));
