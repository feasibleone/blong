import {randomUUID} from 'node:crypto';
import {hostname} from 'node:os';

import {handler, type IMeta} from '@feasibleone/blong';

import type {IAgentSessionRunResult} from '../session/agentSessionRun.ts';
import type {IAgentDispatchPort} from '../settings.ts';

/**
 * `agent.answer.receive` — an answer to a question, stored once and acted on when this host can.
 *
 * Idempotent on the prompt id: a platform retries a click, and the retry is not a second answer
 * (`@@D-702`). Storing is unconditional, resuming is not — the session may be suspended on another host,
 * or its workspace may be gone — so the answer is a durable record first and a wake-up second. A host
 * that cannot resume answers `{stored: true}` and leaves the row for the worker tick or the owning host
 * to consume.
 */
export interface IAgentAnswerReceiveParams {
    promptId: string;
    answerText: string;
    ticketId?: string;
    sessionId?: string;
    senderName?: string;
}

const thisHost = (): string => process.env.HOSTNAME ?? hostname();

export default handler(
    ({
        handler: {
            'db/agentCheckpointPromptGet': agentCheckpointPromptGet,
            'db/agentSessionGet': agentSessionGet,
            'db/agentAnswerAdd': agentAnswerAdd,
            'db/agentAnswerConsume': agentAnswerConsume,
            agentSessionResume,
        },
    }) => ({
        async agentAnswerReceive(
            params: IAgentAnswerReceiveParams,
            $meta: IMeta,
        ): Promise<{stored: boolean; resumed: boolean; status?: string; reason?: string}> {
            const port = this as unknown as IAgentDispatchPort;
            const pending = (await agentCheckpointPromptGet(
                {promptId: params.promptId},
                $meta,
            )) as {
                checkpoint?: Record<string, unknown>;
            };
            const sessionId =
                params.sessionId ??
                (pending.checkpoint?.sessionId ? String(pending.checkpoint.sessionId) : undefined);
            const found = sessionId
                ? ((await agentSessionGet({sessionId}, $meta)) as {
                      session?: Record<string, unknown>;
                  })
                : {};
            const session = found.session;
            const ticketId = params.ticketId ?? (session?.ticketId ? String(session.ticketId) : '');
            const added = (await agentAnswerAdd(
                {
                    answerId: randomUUID(),
                    promptId: params.promptId,
                    ticketId,
                    sessionId,
                    answerText: params.answerText,
                    senderName: params.senderName,
                },
                $meta,
            )) as {stored: boolean; answer?: Record<string, unknown>};
            // A redelivered answer is not resumed twice: the first delivery already decided.
            if (!added.stored) return {stored: true, resumed: false, reason: 'already-stored'};
            const resumable =
                session !== undefined &&
                String(session.status ?? '') === 'suspended' &&
                String(session.workerId ?? '') === thisHost();
            if (!resumable || !sessionId) {
                const reason = !sessionId
                    ? 'no-session'
                    : !session
                      ? 'session-not-found'
                      : String(session.status ?? '') !== 'suspended'
                        ? `status:${String(session.status ?? '')}`
                        : `other-host:${String(session.workerId ?? '')}!==${thisHost()}`;
                // The host that holds the session is the one that can act on this, so it is told — when
                // a broker is configured. No broker, no publish, and the answer waits for that host's
                // worker tick instead: the row is already the truth (`@@D-709`).
                if (sessionId && reason.startsWith('other-host') && port.dispatch) {
                    try {
                        await port.dispatch(
                            {
                                channel: 'agent.answer.wake',
                                message: JSON.stringify({sessionId, promptId: params.promptId}),
                            },
                            {...$meta, method: 'notify.pub.publish', mtid: 'request'},
                        );
                    } catch (error) {
                        port.log?.warn?.({
                            message: `a wake for ${sessionId} was not published: ${String((error as Error)?.message ?? error)}`,
                        });
                    }
                }
                return {stored: true, resumed: false, reason};
            }
            const answerId = added.answer?.answerId ? String(added.answer.answerId) : undefined;
            if (answerId) await agentAnswerConsume({answerId}, $meta);
            const resumed = (await agentSessionResume(
                {
                    sessionId,
                    answer: {
                        promptId: params.promptId,
                        answerText: params.answerText,
                        senderName: params.senderName,
                    },
                },
                $meta,
            )) as IAgentSessionRunResult;
            return {stored: true, resumed: true, status: resumed.status};
        },
    }),
);
