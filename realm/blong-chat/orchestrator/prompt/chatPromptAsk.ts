import {randomUUID} from 'node:crypto';

import {handler, type IMeta} from '@feasibleone/blong';
import type {IChatAnswer, IChatPrompt} from '@feasibleone/blong/types';

import {pendingAdd, pendingKey, pendingTake, type IParkedPrompt} from './pending.ts';

/**
 * A handler answers a failure with `[error]` — the array `errors[name](params, $meta)` returns for
 * the bus to unpack — and a caller one hop below the boundary receives it as a value rather than as a
 * rejection. A question whose send was refused has to fail here, or the caller waits for a timeout to
 * learn what the platform said at once.
 */
function sendFailure(sent: unknown): Error | undefined {
    // Both shapes are real: a handler that fails answers with the `[error]` array the bus unpacks,
    // and a port that fails on the reply answers with the error itself — the Slack port does the
    // latter when the platform refuses a message (`@@F-642`).
    const first = (Array.isArray(sent) ? sent[0] : sent) as {type?: unknown} | undefined;
    return typeof first?.type === 'string' ? (first as Error) : undefined;
}

/**
 * `chat.prompt.ask` — the question that returns its answer.
 *
 * The controls are sent, the call parks on a promise keyed by the prompt it minted, and the answer
 * resolves it — which is what makes this usable where an editor's question tool is not (`@@D-678`). A
 * platform whose controls cannot carry the prompt id (a Viber typed reply, a Slack form submission)
 * still answers, through `chat.in.receive`.
 *
 * A timeout is not an optimisation: without one, a question nobody answered would hold an open
 * request for the life of the process. It is `chatPromptTimeout`, so a caller can tell "nobody
 * answered" from "the platform refused".
 */
export interface IChatAskParams {
    /**
     * The id the caller already recorded, when it has one.
     *
     * A realm that checkpoints a pending question before asking needs the same id on both sides: the
     * answer arrives with the prompt it answers, and a promise keyed by an id the caller never saw is an
     * answer nobody can match (`@@T-574`). Absent, the ask mints its own — the behaviour every other
     * caller relies on.
     */
    promptId?: string;
    platform: 'slack' | 'viber';
    account?: string;
    conversationId: string;
    text: string;
    kind: 'choice' | 'multiChoice' | 'text' | 'confirm';
    options?: Array<{value: string; label: string; description?: string}>;
    placeholder?: string;
    timeoutMs?: number;
    /**
     * Where the question asks for its answer: the port decides unless the caller says.
     *
     * A port renders the surface its platform can serve, and its default is the one the vocabulary
     * recommends — the card in the message on Slack. A caller names `inline` for a question that
     * takes no typing, or `form` for a dialog of several answers (`@@D-691 @@D-818`).
     */
    presentation?: 'inline' | 'form' | 'inlineForm';
    /**
     * Whether the answer is posted back into the conversation. On unless a question says otherwise.
     *
     * A control disappears as soon as it is used: the message left behind says what was asked and
     * nothing about what was answered, which is the gap an echo closes (`@@D-690`). It is per
     * question rather than a deployment setting because one conversation often holds both kinds —
     * a survey whose answers nobody needs to read, and a question whose answer is the point.
     */
    echoAnswer?: boolean;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * The longest a parked question can wait, which is the timer's own ceiling and not a policy.
 *
 * The wait is a `setTimeout` in this process, and Node saturates a delay above `2^31 - 1` ms by firing
 * it as soon as it is scheduled — so a caller asking for a month would be told the question closed the
 * moment it was posted. Refusing the value says what happened; a silent clamp would report a duration
 * the caller never asked for (@@D-822).
 */
const MAX_TIMEOUT_MS = 2_147_483_647;

/** How long the caller waited, in the words a person reading the channel understands. */
const timeoutLabel = (timeoutMs: number): string => {
    const plural = (count: number, unit: string): string =>
        `${count} ${unit}${count === 1 ? '' : 's'}`;
    if (timeoutMs >= 86_400_000) return plural(Math.round(timeoutMs / 86_400_000), 'day');
    if (timeoutMs >= 3_600_000) return plural(Math.round(timeoutMs / 3_600_000), 'hour');
    if (timeoutMs >= 60_000) return plural(Math.round(timeoutMs / 60_000), 'minute');
    return plural(Math.round(timeoutMs / 1000), 'second');
};

export default handler(
    ({
        handler: {chatOutMessageSend, chatOutPromptSettle, chatOutPromptClose},
        lib: {chatAnswerFormat, chatReplyMessageId},
        errors: {errorChatPromptTimeout, errorChatPromptTimeoutTooLong},
    }) => {
        return {
            async chatPromptAsk(params: IChatAskParams, $meta: IMeta): Promise<IChatAnswer> {
                const port = this as unknown as {log?: {warn?: (message: unknown) => void}};
                /**
                 * Show the answer where the question is.
                 *
                 * The question's own message is rewritten — options kept, the chosen ones marked, the
                 * controls gone — because that is the answer a reader of the channel wants, and a
                 * second message beside a live control says the opposite (`@@D-692`). The edit needs
                 * the id the send reply named; when there is none, or the edit is refused, the answer
                 * is posted as a message instead, which is what a channel still gets to see.
                 *
                 * Before the ask returns, not after: a caller that has its answer should be able to
                 * rely on the channel showing it. A refused edit or echo is a warning — the answer has
                 * arrived, and a channel that could not be written to must not take it away
                 * (`@@D-690`).
                 */
                const showAnswer = async (prompt: IChatPrompt, answer: IChatAnswer) => {
                    const settle = async (messageId: string) => {
                        const settled = await chatOutPromptSettle(
                            {
                                platform: params.platform,
                                account: params.account,
                                conversationId: params.conversationId,
                                messageId,
                                prompt,
                                answer,
                                answerText: chatAnswerFormat(answer, params.options),
                            },
                            $meta,
                        );
                        const refused = sendFailure(settled);
                        if (refused) throw refused;
                    };
                    try {
                        if (messageId) return await settle(messageId);
                    } catch (error) {
                        port.log?.warn?.(error);
                    }
                    try {
                        const sent = await chatOutMessageSend(
                            {
                                platform: params.platform,
                                account: params.account,
                                conversationId: params.conversationId,
                                text: `Answer: ${chatAnswerFormat(answer, params.options)}`,
                            },
                            $meta,
                        );
                        const refused = sendFailure(sent);
                        if (refused) throw refused;
                    } catch (error) {
                        port.log?.warn?.(error);
                    }
                };
                const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
                // Before anything is posted: a timer that saturates would close the question in the
                // same turn it was asked, which reads as a person ignoring it within seconds.
                if (!Number.isFinite(timeoutMs) || timeoutMs > MAX_TIMEOUT_MS)
                    throw errorChatPromptTimeoutTooLong(
                        {params: {timeoutMs, maxTimeoutMs: MAX_TIMEOUT_MS}},
                        $meta,
                    );
                /**
                 * Take the controls away when the question closes itself.
                 *
                 * The ask has failed by then, so this cannot be the error the caller sees: the close
                 * is best-effort cleanup on a message nobody is waiting behind, and a platform that
                 * refuses the edit leaves a stale message rather than a second failure (`@@T-524`).
                 */
                const closeQuestion = async (prompt: IChatPrompt): Promise<void> => {
                    try {
                        await chatOutPromptClose(
                            {
                                platform: params.platform,
                                account: params.account,
                                conversationId: params.conversationId,
                                messageId,
                                prompt,
                                notice: `_No answer within ${timeoutLabel(timeoutMs)} — the question is closed._`,
                            },
                            $meta,
                        );
                    } catch (error) {
                        port.log?.warn?.(error);
                    }
                };
                const prompt: IChatPrompt = {
                    promptId: params.promptId ?? randomUUID(),
                    kind: params.kind,
                    text: params.text,
                    ...(params.options && {options: params.options}),
                    ...(params.placeholder && {placeholder: params.placeholder}),
                    // Absent, not `'inline'`: the port owns the default, and a realm that filled it in
                    // silently overrode the surface the vocabulary recommends (`@@D-818`).
                    ...(params.presentation && {presentation: params.presentation}),
                };
                const parked: IParkedPrompt = {
                    platform: params.platform,
                    account: params.account,
                    conversationId: params.conversationId,
                    prompt,
                };
                const key = pendingKey(prompt.promptId, parked);
                // Declared before the timer because the timer is what needs it: a question that
                // expires rewrites the message the send reply named (`@@T-524`).
                let messageId: string | undefined;
                const answered = new Promise<IChatAnswer>((resolve, reject) => {
                    const timer = setTimeout(() => {
                        pendingTake(key);
                        void closeQuestion(prompt);
                        reject(
                            errorChatPromptTimeout(
                                {params: {promptId: prompt.promptId, timeoutMs}},
                                $meta,
                            ),
                        );
                    }, timeoutMs);
                    // A question waiting for a person must not be the reason the process cannot exit.
                    timer.unref();
                    pendingAdd({key, params: parked, resolve, reject, timer});
                });
                try {
                    const sent = await chatOutMessageSend(parked, $meta);
                    const refused = sendFailure(sent);
                    if (refused) throw refused;
                    // Where the question is, so the answer can be written over it later.
                    messageId = chatReplyMessageId(sent);
                } catch (error) {
                    const entry = pendingTake(key);
                    if (entry) {
                        clearTimeout(entry.timer);
                        entry.reject(error as Error);
                    }
                    // The parked promise is rejected and nobody will read it — this call throws the
                    // same error itself, which is the answer the caller gets.
                    answered.catch(() => undefined);
                    throw error;
                }
                const answer = await answered;
                if (params.echoAnswer !== false) await showAnswer(prompt, answer);
                return answer;
            },
        };
    },
);
