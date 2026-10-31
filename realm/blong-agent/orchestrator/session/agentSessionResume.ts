import {randomUUID} from 'node:crypto';

import {handler, type IMeta} from '@feasibleone/blong';

import type {IAgentSessionRunResult} from './agentSessionRun.ts';

/**
 * `agent.session.resume` — continue a suspended session with the answer it was waiting for.
 *
 * The checkpoint is what is resumed, not the engine: a `step` session continues from the transcript with
 * the answer appended as the pending tool call's result, and a `native` session asks its engine to carry
 * on from the session id it stored (`@@D-709`). That is why a session may be resumed by a host that never
 * ran it, as long as it holds the workspace.
 *
 * A session that is not suspended has nothing to resume, and answering that with silence would let a
 * caller believe an answer was delivered when it was not.
 */
export interface IAgentSessionResumeParams {
    sessionId: string;
    workerId?: string;
    /** The answer, when this resume is the answer to a parked question. */
    answer?: {promptId: string; answerText: string; senderName?: string};
    /** The conversation a further question is asked in. */
    channel?: {platform?: string; account?: string; conversationId?: string};
}

export default handler(
    ({
        handler: {
            'db/agentSessionGet': agentSessionGet,
            'db/agentSessionEdit': agentSessionEdit,
            'db/agentCheckpointLastGet': agentCheckpointLastGet,
            'db/agentEventFind': agentEventFind,
            'db/agentEventAdd': agentEventAdd,
            agentSessionRun,
        },
        errors: {errorAgentSessionNotFound, errorAgentCheckpointMissing},
    }) => ({
        async agentSessionResume(
            params: IAgentSessionResumeParams,
            $meta: IMeta,
        ): Promise<IAgentSessionRunResult> {
            const found = (await agentSessionGet({sessionId: params.sessionId}, $meta)) as {
                session?: Record<string, unknown>;
            };
            const session = found.session;
            if (!session) throw errorAgentSessionNotFound({sessionId: params.sessionId});
            const last = (await agentCheckpointLastGet({sessionId: params.sessionId}, $meta)) as {
                checkpoint?: Record<string, unknown>;
            };
            if (!last.checkpoint) throw errorAgentCheckpointMissing({sessionId: params.sessionId});
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
                    kind: 'resume',
                    payloadJSON: JSON.stringify({
                        promptId: params.answer?.promptId,
                        pendingPromptId: last.checkpoint.pendingPromptId,
                    }),
                },
                $meta,
            );
            const native = String(session.engineMode ?? 'step') === 'native';
            // The resume is the thing that lifts the suspension, so it says so before the run starts:
            // the run refuses a suspended session it was not given an answer for, and a confirmation
            // that carries no answer is still a resume — the transcript continues where it stopped.
            await agentSessionEdit(
                {sessionId: params.sessionId, patch: {status: 'running'}},
                $meta,
            );
            return agentSessionRun(
                {
                    sessionId: params.sessionId,
                    workerId:
                        params.workerId ??
                        (session.workerId ? String(session.workerId) : undefined),
                    // A native engine is told the answer as its next prompt; a step session folds it in as
                    // the pending tool's result and continues the transcript it already has.
                    ...(native
                        ? {prompt: params.answer?.answerText ?? 'Continue.'}
                        : {answer: params.answer}),
                    channel: params.channel,
                },
                $meta,
            );
        },
    }),
);
