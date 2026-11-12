import {validation} from '@feasibleone/blong';

/**
 * `chat.channel.topic` — re-apply what a plan's channel says about itself.
 *
 * Authenticated like every other write into a conversation: the topic is the line that carries the
 * GitHub issue a reader clicks, so changing it is as much a write as posting into the channel
 * (`@@D-802`). The result echoes the topic the platform was given, which is what `plan sync` prints.
 */
export default validation(
    async ({lib: {type}}) =>
        function chatChannelTopic() {
            return {
                params: type.Object({
                    platform: type.Union([type.Literal('slack'), type.Literal('viber')]),
                    account: type.Optional(type.String()),
                    conversationId: type.String({maxLength: 64}),
                    topic: type.String({maxLength: 250}),
                }),
                result: type.Object(
                    {
                        conversationId: type.String(),
                        topic: type.String(),
                    },
                    {additionalProperties: true},
                ),
            };
        },
);
