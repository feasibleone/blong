import {randomUUID} from 'node:crypto';

import {handler, type IMeta} from '@feasibleone/blong';

import {agentSettings, type IAgentDispatchPort} from '../settings.ts';
import {agentHistory} from '../tools.ts';

/**
 * `agent.question.ask` — the question a human answers, and the checkpoint that makes the wait cold-safe.
 *
 * The pending checkpoint is written **before** the ask, not after it: a process that dies while the
 * question is out has to leave behind the prompt id, the tool call it belongs to and the transcript up
 * to it, or the answer that arrives later has nothing to attach to (`@@D-709`). Writing it afterwards
 * would make the interruption safe only while the asker survives.
 *
 * The ask is the port's `questionMethod`, which is `chat.prompt.ask` unless a deployment or a test names
 * another: the realm does not know how a question reaches a person, only that it does (`@@D-702`). A
 * timeout is not an error here — it is the suspension the session then takes, so the session decides
 * what a timeout means and this method only reports it.
 */
export interface IAgentQuestionAskParams {
    sessionId: string;
    ticketId: string;
    question: string;
    options?: string[];
    /** The conversation the question is asked in, when the ticket named one. */
    platform?: string;
    account?: string;
    conversationId?: string;
    /** The tool call this question belongs to, so a resume can answer it. */
    toolCallId?: string;
    timeoutMs?: number;
}

/**
 * The answer inside whatever the question method replied with.
 *
 * A dispatch answers the response the callee produced, sometimes wrapped in the array the transport
 * carries, and every platform names the selection differently — `value` for a choice, `text` for a typed
 * reply, `answer.value` when the answer is nested. Reading all three here is what keeps the realm from
 * inventing a fourth.
 */
const answerOf = (
    value: unknown,
): {value?: string; text?: string; senderName?: string; answer?: {value?: string}} => {
    if (Array.isArray(value)) return answerOf(value[0]);
    if (value && typeof value === 'object')
        return value as {value?: string; text?: string; senderName?: string};
    return {};
};

const timed = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T | 'timeout'> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expiry = new Promise<'timeout'>(resolve => {
        timer = setTimeout(() => resolve('timeout'), timeoutMs);
        // A pending question must not hold the process open by itself.
        (timer as unknown as {unref?: () => void}).unref?.();
    });
    try {
        return await Promise.race([promise, expiry]);
    } finally {
        if (timer) clearTimeout(timer);
    }
};

export default handler(
    ({
        handler: {
            'db/agentCheckpointLastGet': agentCheckpointLastGet,
            'db/agentCheckpointAdd': agentCheckpointAdd,
        },
        errors: {errorAgentSessionNotFound},
    }) => ({
        async agentQuestionAsk(
            params: IAgentQuestionAskParams,
            $meta: IMeta,
        ): Promise<{
            promptId: string;
            answerText?: string;
            senderName?: string;
            suspended?: boolean;
        }> {
            const port = this as unknown as IAgentDispatchPort;
            const settings = agentSettings(port.config);
            if (!port.dispatch) throw errorAgentSessionNotFound({sessionId: params.sessionId});
            const promptId = randomUUID();
            const last = (await agentCheckpointLastGet({sessionId: params.sessionId}, $meta)) as {
                checkpoint?: Record<string, unknown>;
            };
            const historyJSON = JSON.stringify(agentHistory(last.checkpoint?.historyJSON));
            const sequence = Number(last.checkpoint?.sequence ?? 0) + 1;
            const stepCount = Number(last.checkpoint?.stepCount ?? 0);
            await agentCheckpointAdd(
                {
                    checkpointId: randomUUID(),
                    sessionId: params.sessionId,
                    sequence,
                    historyJSON,
                    pendingPromptId: promptId,
                    pendingToolCallId: params.toolCallId,
                    pendingQuestionText: params.question.slice(0, 4000),
                    stepCount,
                },
                $meta,
            );
            const timeoutMs = params.timeoutMs ?? settings.questionTimeoutMs;
            const asked = timed(
                port.dispatch(
                    {
                        platform: params.platform ?? 'slack',
                        account: params.account,
                        conversationId: params.conversationId ?? params.ticketId,
                        text: params.question,
                        kind: params.options?.length ? 'choice' : 'text',
                        options: params.options?.map(value => ({value, label: value})),
                        promptId,
                        timeoutMs,
                    },
                    {...$meta, method: settings.questionMethod, mtid: 'request'},
                ),
                timeoutMs,
            );
            const answer = await asked;
            if (answer === 'timeout') return {promptId, suspended: true};
            const picked = answerOf(answer);
            const answerText = picked.value ?? picked.text ?? picked.answer?.value ?? '';
            return {promptId, answerText, senderName: picked.senderName};
        },
    }),
);
