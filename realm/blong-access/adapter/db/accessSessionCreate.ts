import {type IMeta, handler} from '@feasibleone/blong';

import * as account from './account.ts';
import * as model from './accessModel.ts';

type KnexQb = any;

/**
 * `access.session.create` — record a new session after successful login.
 *
 * Sessions are standalone rows (`access_session`), not resource-backed.  The
 * PK is a fresh UUID (dashed string on the wire, binary in the table).  The
 * `tokenHash` is the SHA-256 hex of the initial refresh token and is rotated
 * on every renewal.  `lastActivityAt` seeds the inactivity timer.
 *
 * Wire: `access.session.create` — called by `login.token.create` (and the
 * client-credentials variant) right after the credential check succeeds.
 */
export default handler(() => ({
    async accessSessionCreate(
        params: {
            userId: string; // base64/hex of the raw binary(16) user key
            credentialId: number;
            tokenHash: string;
            expiresAt: Date | string;
            lastActivityAt?: Date | string;
            ipAddress?: string | null;
            /** Optional pre-generated session id (dashed UUID) — used by the login flow. */
            sessionId?: string;
            /** SHA-256 hex of the restore-cookie handle (set on login). */
            cookieHash?: string | null;
        },
        $meta: IMeta,
    ): Promise<{sessionId: string; userId: string}> {
        const qb: KnexQb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const userHex = model.binHex(params.userId);
        if (!userHex) throw new Error('Invalid userId for session create');
        // Normalise to the DB storage byte order: the cross-realm bus delivers
        // binary(base64) values in the logical/crockford order, while the FK
        // columns store the mysql2 UUID byte order — so reverse the 16 bytes.
        const userIdBuf = Buffer.from(userHex, 'hex');
        userIdBuf.reverse();
        const sessionId = params.sessionId ?? account.newUuid();
        const now = new Date();
        await qb('access_session').insert({
            sessionId: Buffer.from(sessionId.replace(/-/g, ''), 'hex'),
            userId: userIdBuf,
            credentialId: params.credentialId,
            tokenHash: params.tokenHash,
            issuedAt: now,
            expiresAt: new Date(params.expiresAt),
            lastActivityAt: params.lastActivityAt ? new Date(params.lastActivityAt) : now,
            ipAddress: params.ipAddress ?? $meta?.ipAddress ?? null,
            isRevoked: 0,
            revokedAt: null,
            cookieHash: params.cookieHash ?? null,
        });
        return {sessionId, userId: Buffer.from(userHex, 'hex').toString('base64')};
    },
}));
