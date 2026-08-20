import {type IMeta, handler} from '@feasibleone/blong';

import * as model from './accessModel.ts';

type KnexQb = any;

/**
 * A single audit entry.  `isSuccess` is required; all other context fields
 * are optional.  `detail` is an object (stored JSON) — for access-table DML
 * events it should be a sanitised summary (entity + key), never full params.
 */
export interface IAuditEntry {
    userId?: string | null;
    actorId?: string | null;
    sessionId?: string | null;
    actionName: string;
    credentialType?: string | null;
    ipAddress?: string | null;
    isSuccess: boolean;
    failureReason?: string | null;
    statusCode?: number | null;
    detail?: object | null;
    occurredAt?: Date | string | null;
}

/**
 * `access.audit.record` — append audit rows.
 *
 * Append-only writer used by the gateway access-check audit hook and by the
 * login/refresh/revoke flows.  PK is a ULID (`access.audit.auditId`), the
 * `*JSON`-style detail is stored as a string.  Batch insert for efficiency.
 * Returns the inserted ULID keys (`auditIds`) so callers can correlate — the
 * gateway exposes the first one on `$meta.auth.auditId`.
 *
 * Wire: `access.audit.record`.
 */
export default handler(({lib: {ulid, crockfordDecode}}) => ({
    async accessAuditRecord(
        params: {audit: IAuditEntry[]},
        _$meta: IMeta,
    ): Promise<{inserted: number; auditIds: string[]}> {
        const qb: KnexQb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const entries = Array.isArray(params.audit) ? params.audit : [];
        if (!entries.length) return {inserted: 0, auditIds: []};
        const auditIds = entries.map(() => ulid());
        const rows = entries.map((entry, index) => {
            const userHex = entry.userId ? model.binHex(entry.userId) : undefined;
            return {
                auditId: Buffer.from(crockfordDecode(auditIds[index])),
                userId: userHex ? Buffer.from(userHex, 'hex') : null,
                actorId: entry.actorId ?? null,
                sessionId: entry.sessionId ?? null,
                actionName: entry.actionName,
                credentialType: entry.credentialType ?? null,
                ipAddress: entry.ipAddress ?? null,
                isSuccess: entry.isSuccess ? 1 : 0,
                failureReason: entry.failureReason ?? null,
                statusCode: entry.statusCode ?? null,
                detail: entry.detail ? JSON.stringify(entry.detail) : null,
                occurredAt: entry.occurredAt ? new Date(entry.occurredAt) : new Date(),
            };
        });
        await qb('access_audit').insert(rows);
        return {inserted: rows.length, auditIds};
    },
}));
