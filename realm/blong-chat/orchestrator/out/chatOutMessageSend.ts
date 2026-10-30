import {handler, type IMeta} from '@feasibleone/blong';
import type {IChatAttachment, IChatPrompt} from '@feasibleone/blong/types';

/**
 * `chat.out.message.send` — post to a platform, chosen at the call.
 *
 * The platform is a parameter rather than a port the realm holds, which is the shape the request asked
 * for: the caller says where the message goes, and this handler is the one place that knows which port
 * answers to `slack` and which to `viber`. A prompt is sent through the port's prompt conversion, so
 * the controls a platform can render are decided by the port and not here (`@@D-679`).
 */
export interface IChatOutSendParams {
    platform: 'slack' | 'viber';
    account?: string;
    conversationId: string;
    text?: string;
    attachments?: IChatAttachment[];
    prompt?: IChatPrompt;
}

export default handler(
    ({
        handler: {slackMessageSend, slackPromptSend, viberMessageSend, viberPromptSend},
        errors: {errorChatPlatformUnsupported},
    }) => ({
        async chatOutMessageSend(params: IChatOutSendParams, $meta: IMeta): Promise<unknown> {
            if (params.platform !== 'slack' && params.platform !== 'viber')
                throw errorChatPlatformUnsupported(
                    {params: {platformName: String(params.platform), controlKind: 'message'}},
                    $meta,
                );
            if (params.prompt) {
                const send = params.platform === 'slack' ? slackPromptSend : viberPromptSend;
                return send(
                    {
                        account: params.account,
                        conversationId: params.conversationId,
                        prompt: params.prompt,
                    },
                    $meta,
                );
            }
            const send = params.platform === 'slack' ? slackMessageSend : viberMessageSend;
            return send(
                {
                    account: params.account,
                    conversationId: params.conversationId,
                    text: params.text,
                    attachments: params.attachments,
                },
                $meta,
            );
        },
    }),
);
