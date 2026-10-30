import {handler, type IMeta} from '@feasibleone/blong';
import type {IChatAnswer, IChatPrompt} from '@feasibleone/blong/types';

/**
 * `chat.out.prompt.settle` — rewrite the question's own message once it is answered.
 *
 * The question said what it wanted and the message says what came back, so the answer belongs where
 * the question is rather than in a second message beside it: the options stay, the chosen ones are
 * marked, and the controls go, because a control that no longer answers anything is a trap
 * (`@@D-692`). The platform is a parameter here for the same reason it is on `chat.out.message.send`
 * — the caller says where, and this is the one place that knows which port answers to `slack` and
 * which to `viber`.
 *
 * The message id is what the send reply named, which is why a caller that asked a question holds it.
 * A platform that reported none leaves the caller with the echo it posts instead.
 */
export interface IChatSettleParams {
    platform: 'slack' | 'viber';
    account?: string;
    conversationId: string;
    /** What the platform called the message the question was posted as. */
    messageId?: string;
    prompt: IChatPrompt;
    answer: IChatAnswer;
    /** The answer in words, rendered by the caller that knows the question's vocabulary. */
    answerText: string;
}

export default handler(
    ({
        handler: {slackPromptSettle, viberPromptSettle},
        errors: {errorChatPlatformUnsupported},
    }) => ({
        async chatOutPromptSettle(params: IChatSettleParams, $meta: IMeta): Promise<unknown> {
            if (params.platform !== 'slack' && params.platform !== 'viber')
                throw errorChatPlatformUnsupported(
                    {params: {platformName: String(params.platform), controlKind: 'question'}},
                    $meta,
                );
            const settle = params.platform === 'slack' ? slackPromptSettle : viberPromptSettle;
            return settle(
                {
                    account: params.account,
                    conversationId: params.conversationId,
                    messageId: params.messageId,
                    prompt: params.prompt,
                    answer: params.answer,
                    answerText: params.answerText,
                },
                $meta,
            );
        },
    }),
);
