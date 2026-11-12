import {validation} from '@feasibleone/blong';

/**
 * `chat.channel.create` — open a plan's channel and answer its id.
 *
 * Authenticated, like every write into a conversation: a private channel is a place messages are
 * posted and questions are asked, so the route answers to the same authority as sending one
 * (`@@D-802`). The result carries the `conversationId` a caller stores — that id is what
 * `chat.prompt.ask` addresses, so a plan keeps it in its own file.
 */
export default validation(
    async ({lib: {type}}) =>
        function chatChannelCreate() {
            return {
                params: type.Object({
                    platform: type.Union([type.Literal('slack'), type.Literal('viber')]),
                    account: type.Optional(type.String()),
                    channelName: type.String({maxLength: 80}),
                    title: type.Optional(type.String({maxLength: 255})),
                    topic: type.Optional(type.String({maxLength: 250})),
                    isPrivate: type.Optional(type.Boolean()),
                    invite: type.Optional(type.Array(type.String({maxLength: 64}))),
                }),
                result: type.Object(
                    {
                        channel: type.Object(
                            {
                                platform: type.String(),
                                account: type.String(),
                                conversationId: type.String(),
                                channelName: type.String(),
                                topic: type.Optional(type.String()),
                            },
                            {additionalProperties: true},
                        ),
                    },
                    {additionalProperties: true},
                ),
            };
        },
);
