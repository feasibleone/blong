import {type IMeta, handler} from '@feasibleone/blong';

import * as model from './accessModel.ts';

type KnexQb = any;

/**
 * `access.session.rotate` — rotate a session's refresh-token hash and update
 * its last-activity timestamp after a successful renewal.
 *
 * The `tokenHash` column holds the SHA-256 hex of the CURRENT refresh token.
 * Renewal mints a fresh refresh token, so the hash must be rotated — this is
 * what makes a stolen, already-used refresh token useless (replay detection on
 * next use: the presented token's hash will not match the stored one).
 *
 * Wire: `access.session.rotate` — called by `login.token.refresh`.
 */
export default handler(() => ({
    async accessSessionRotate(
        params: {sessionId: string; tokenHash: string},
        $meta: IMeta,
    ): Promise<{success: boolean}> {
        const qb: KnexQb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const hex = model.binHex(params.sessionId);
        if (!hex) return {success: false};
        const updated = await qb('access_session')
            .where('sessionId', Buffer.from(hex, 'hex'))
            .update({tokenHash: params.tokenHash, lastActivityAt: new Date()});
        return {success: !!updated};
    },
}));
