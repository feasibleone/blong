import {handler, type IMeta} from '@feasibleone/blong';

import {pendingGet, pendingKey} from '../prompt/pending.ts';

/**
 * `chat.out.prompt.form` — open the form a multiple choice or a text question is answered in.
 *
 * Slack lets a modal open only from an interaction, so the message a prompt posts carries a button and
 * the click comes back as `kind: 'prompt.form'`. The question itself is not in that payload, which is
 * why the prompt store is read here (without consuming the ask — the answer still has to arrive) and
 * the stored controls are rendered into the view.
 */
export interface IChatPromptFormParams {
    platform: 'slack' | 'viber';
    account?: string;
    conversationId: string;
    promptId: string;
    triggerId?: string;
}

export default handler(
    ({
        handler: {slackPromptForm},
        errors: {errorChatPromptNothingPending, errorChatPlatformUnsupported},
    }) => ({
        async chatOutPromptForm(params: IChatPromptFormParams, $meta: IMeta): Promise<unknown> {
            const parked = pendingGet(pendingKey(params.promptId, params));
            if (!parked)
                throw errorChatPromptNothingPending({params: {promptId: params.promptId}}, $meta);
            if (params.platform !== 'slack')
                throw errorChatPlatformUnsupported(
                    {params: {platformName: params.platform, controlKind: 'form'}},
                    $meta,
                );
            return slackPromptForm(
                {
                    account: params.account,
                    conversationId: params.conversationId,
                    prompt: parked.params.prompt,
                    triggerId: params.triggerId ?? '',
                },
                $meta,
            );
        },
    }),
);
