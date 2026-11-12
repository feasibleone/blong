import {handler, type IMeta} from '@feasibleone/blong';

/**
 * `chat.channel.topic` — set what an existing channel says about itself.
 *
 * A channel is created once and its id remembered, so its topic cannot ride along with a second
 * create: the name is used up (`name_taken`). And a plan's topic is not fixed — it names the GitHub
 * issue, which may be created after the channel, and the plan's title, which may change. This is the
 * one call that repairs it (`@@D-812`).
 *
 * The platform call is the port's; the realm's work is the refusal of a platform that has no such
 * control and the reading of an answer that failed while still answering `ok: false`.
 */
export interface IChatChannelTopicInput {
    platform: 'slack' | 'viber';
    account?: string;
    /** The conversation the topic belongs to, as the caller stored it. */
    conversationId: string;
    /** What the channel should say, at most the platform's 250 characters. */
    topic: string;
}

export default handler(
    ({
        handler: {slackChannelTopic},
        errors: {errorChatPlatformUnsupported, errorChatChannelTopicFailed},
    }) => ({
        async chatChannelTopic(
            params: IChatChannelTopicInput,
            $meta: IMeta,
        ): Promise<{conversationId: string; topic: string}> {
            if (params.platform !== 'slack') {
                throw errorChatPlatformUnsupported(
                    {params: {platformName: String(params.platform), controlKind: 'channel topic'}},
                    $meta,
                );
            }

            const answer = (await slackChannelTopic(
                {
                    account: params.account,
                    conversationId: params.conversationId,
                    topic: params.topic,
                },
                $meta,
            )) as {ok?: boolean; error?: string} | undefined;

            if (answer && answer.ok === false) {
                throw errorChatChannelTopicFailed(
                    {
                        params: {
                            platformName: params.platform,
                            conversationId: params.conversationId,
                            reason: answer.error ?? 'the platform refused the topic',
                        },
                    },
                    $meta,
                );
            }

            return {conversationId: params.conversationId, topic: params.topic};
        },
    }),
);
