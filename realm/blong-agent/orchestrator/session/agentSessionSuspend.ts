import {randomUUID} from 'node:crypto';

import {handler, type IMeta} from '@feasibleone/blong';

/**
 * `agent.session.suspend` — the session stops waiting and says why.
 *
 * Suspension is a state, not a failure: the workspace is on disk, the transcript is in the checkpoint and
 * the question's prompt id is recorded beside it, so an answer that arrives in an hour — or on another
 * host — still has somewhere to go (`@@D-709`). The engine is closed by the caller's `finally`, because
 * what a suspension must not leave behind is a live session it cannot feed.
 */
export interface IAgentSessionSuspendParams {
    sessionId: string;
    /** The question that was left unanswered, when that is the reason. */
    promptId?: string;
    reason?: 'question' | 'shutdown' | 'timeout';
}

export default handler(
    ({
        handler: {
            'db/agentSessionGet': agentSessionGet,
            'db/agentSessionEdit': agentSessionEdit,
            'db/agentEventFind': agentEventFind,
            'db/agentEventAdd': agentEventAdd,
        },
        errors: {errorAgentSessionNotFound},
    }) => ({
        async agentSessionSuspend(
            params: IAgentSessionSuspendParams,
            $meta: IMeta,
        ): Promise<{sessionId: string; status: string; promptId?: string}> {
            const found = (await agentSessionGet({sessionId: params.sessionId}, $meta)) as {
                session?: Record<string, unknown>;
            };
            if (!found.session) throw errorAgentSessionNotFound({sessionId: params.sessionId});
            await agentSessionEdit(
                {sessionId: params.sessionId, patch: {status: 'suspended'}},
                $meta,
            );
            const events = (await agentEventFind(
                {sessionId: params.sessionId, limit: 500},
                $meta,
            )) as {
                events: Array<Record<string, unknown>>;
            };
            await agentEventAdd(
                {
                    eventId: randomUUID(),
                    sessionId: params.sessionId,
                    sequence: events.events.length + 1,
                    kind: 'suspend',
                    payloadJSON: JSON.stringify({
                        reason: params.reason ?? 'question',
                        promptId: params.promptId,
                    }),
                },
                $meta,
            );
            return {sessionId: params.sessionId, status: 'suspended', promptId: params.promptId};
        },
    }),
);
