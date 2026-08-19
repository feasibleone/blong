import {type IMeta, handler} from '@feasibleone/blong';

import * as model from './accessModel.ts';

type KnexQb = any;

/**
 * `access.session.close` — revoke a session.
 *
 * Custom action wired to the "Close Session" toolbar button on the session
 * browse page. Sessions are standalone rows (`access_session`), not
 * resource-backed; closing simply marks the row `isRevoked`.
 */
export default handler(() => ({
    async accessSessionClose(
        params: {sessionId?: string},
        $meta: IMeta,
    ): Promise<{success: boolean}> {
        const qb: KnexQb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const hex = model.binHex(params.sessionId);
        if (!hex) return {success: false};
        await qb('access_session')
            .where('sessionId', Buffer.from(hex, 'hex'))
            .update({isRevoked: 1});
        return {success: true};
    },
}));
