import {handler, type IMeta} from '@feasibleone/blong';
import type {IChatPrompt} from '@feasibleone/blong/types';

/**
 * `chat.out.prompt.close` — take the controls off a question nobody answered.
 *
 * A timeout ends the ask, not the message: the options and the submit button stay in the channel and
 * still look live, so a late click resolves nothing and reads as a broken control. The platform's own
 * edit is what closes it — the question stays, the answer it never got is named, and nothing
 * interactive survives (`@@T-524`).
 *
 * A platform that cannot edit a message has nothing to close here, and returning quietly is the honest
 * answer: the caller already holds the timeout, and a refusal would be the same failure reported twice.
 */
export interface IChatPromptCloseOutParams {
    platform: 'slack' | 'viber';
    account?: string;
    conversationId: string;
    /** What the platform called the message the question was posted as. */
    messageId?: string;
    prompt: IChatPrompt;
    /** Why it closed, in the caller's words — it knows what it asked and how long it waited. */
    notice: string;
}

export default handler(({handler: {slackPromptClose}}) => ({
    async chatOutPromptClose(params: IChatPromptCloseOutParams, $meta: IMeta): Promise<unknown> {
        if (params.platform !== 'slack') return undefined;
        // A message nobody named cannot be edited, and editing whatever sits at the end of the
        // conversation would close somebody else's question.
        if (!params.messageId) return undefined;
        return slackPromptClose(
            {
                account: params.account,
                conversationId: params.conversationId,
                messageId: params.messageId,
                prompt: params.prompt,
                notice: params.notice,
            },
            $meta,
        );
    },
}));
