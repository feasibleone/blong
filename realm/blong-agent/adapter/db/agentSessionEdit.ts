import type {IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

/**
 * `agent.session.edit` — move a session through its states.
 *
 * The engine session id is written here too, which is what makes a native resume name the session the
 * harness kept rather than a new one (`@@D-711`).
 */
export default handler(({lib: {uuidBuf}}) => ({
    async agentSessionEdit(
        params: {
            sessionId: string;
            patch: {
                status?: string;
                engineSessionId?: string | null;
                lastEventAt?: string;
                baseCommit?: string | null;
                /** When the conversation was last active, which a chat turn moves on arrival. */
                lastActivityAt?: string;
                compactedAt?: string | null;
                compactionCount?: number;
            };
        },
        _$meta: IMeta,
    ): Promise<{updated: boolean}> {
        const qb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const patch: Record<string, unknown> = {updatedAt: new Date()};
        if (params.patch.status !== undefined) patch.status = params.patch.status;
        if (params.patch.engineSessionId !== undefined)
            patch.engineSessionId = params.patch.engineSessionId;
        if (params.patch.baseCommit !== undefined) patch.baseCommit = params.patch.baseCommit;
        if (params.patch.lastEventAt !== undefined)
            patch.lastEventAt = new Date(params.patch.lastEventAt);
        if (params.patch.lastActivityAt !== undefined)
            patch.lastActivityAt = new Date(params.patch.lastActivityAt);
        if (params.patch.compactedAt !== undefined)
            patch.compactedAt = params.patch.compactedAt
                ? new Date(params.patch.compactedAt)
                : null;
        if (params.patch.compactionCount !== undefined)
            patch.compactionCount = params.patch.compactionCount;
        const updated = await qb('agent_session')
            .where('sessionId', uuidBuf(params.sessionId))
            .update(patch);
        return {updated: Number(updated) > 0};
    },
}));
