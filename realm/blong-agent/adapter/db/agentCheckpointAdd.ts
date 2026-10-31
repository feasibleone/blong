import type {IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

/**
 * `agent.checkpoint.add` — one step boundary, written as a row.
 *
 * The transcript and the pending question are one row because they are one decision: what the session
 * knew, and what it was waiting for when it stopped (`@@D-702`).
 */
export default handler(({lib: {uuidBuf}}) => ({
    async agentCheckpointAdd(
        params: {
            checkpointId: string;
            sessionId: string;
            sequence: number;
            historyJSON: string;
            pendingPromptId?: string;
            pendingToolCallId?: string;
            pendingQuestionText?: string;
            stepCount: number;
        },
        _$meta: IMeta,
    ): Promise<{checkpointId: string; sequence: number}> {
        const qb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        await qb('agent_checkpoint').insert({
            checkpointId: uuidBuf(params.checkpointId),
            sessionId: uuidBuf(params.sessionId),
            sequence: params.sequence,
            historyJSON: params.historyJSON,
            pendingPromptId: params.pendingPromptId ?? null,
            pendingToolCallId: params.pendingToolCallId ?? null,
            pendingQuestionText: params.pendingQuestionText ?? null,
            stepCount: params.stepCount,
            createdAt: new Date(),
        });
        return {checkpointId: params.checkpointId, sequence: params.sequence};
    },
}));
