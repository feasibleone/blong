import {hostname} from 'node:os';

import {handler, type IMeta} from '@feasibleone/blong';

import type {IAgentSessionRunResult} from '../session/agentSessionRun.ts';

/**
 * `agent.answer.wake` — the broker's nudge, when one is configured.
 *
 * A wake is an optimisation and never the mechanism: the worker tick is what makes progress when no
 * broker is deployed, so a wake that finds nothing to do answers `{resumed: false}` and says nothing
 * (`@@D-709`). It only looks at a session this host owns, because the workspace is the thing that cannot
 * move between hosts, and a wake delivered to every pod has to be safe to ignore on most of them.
 */
export interface IAgentAnswerWakeParams {
    sessionId?: string;
    promptId?: string;
}

const thisHost = (): string => process.env.HOSTNAME ?? hostname();

export default handler(
    ({
        handler: {
            'db/agentAnswerFind': agentAnswerFind,
            'db/agentSessionGet': agentSessionGet,
            'db/agentAnswerConsume': agentAnswerConsume,
            agentSessionResume,
        },
    }) => ({
        async agentAnswerWake(
            params: IAgentAnswerWakeParams,
            $meta: IMeta,
        ): Promise<{resumed: boolean; sessionId?: string}> {
            const found = params.sessionId
                ? ((await agentSessionGet({sessionId: params.sessionId}, $meta)) as {
                      session?: Record<string, unknown>;
                  })
                : {};
            const session = found.session;
            if (!session) return {resumed: false};
            if (String(session.workerId ?? '') !== thisHost()) return {resumed: false};
            if (String(session.status ?? '') !== 'suspended') return {resumed: false};
            const sessionId = String(session.sessionId);
            const answers = (await agentAnswerFind(
                {sessionId, consumed: false, limit: 1},
                $meta,
            )) as {
                answers: Array<Record<string, unknown>>;
            };
            const answer = answers.answers?.[0];
            if (!answer) return {resumed: false, sessionId};
            await agentAnswerConsume({answerId: String(answer.answerId)}, $meta);
            const resumed = (await agentSessionResume(
                {
                    sessionId,
                    answer: {
                        promptId: String(answer.promptId ?? ''),
                        answerText: String(answer.answerText ?? ''),
                        senderName: answer.senderName ? String(answer.senderName) : undefined,
                    },
                },
                $meta,
            )) as IAgentSessionRunResult;
            return {resumed: resumed.status !== 'suspended', sessionId};
        },
    }),
);
