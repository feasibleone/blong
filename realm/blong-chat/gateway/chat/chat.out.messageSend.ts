import {validation} from '@feasibleone/blong';

/**
 * `chat.out.messageSend` — the one way to speak into a chat from outside the process.
 *
 * Unauthenticated on purpose in this pass: the realm carries no users, and the address is what a
 * deployment protects (`@@D-682`). The prompt is passed as `unknown` rather than restated, because its
 * shape belongs to `IChatPrompt` in `@feasibleone/blong` and a second definition here would be the one
 * that drifts.
 */
export default validation(
    async ({lib: {type}}) =>
        function chatOutMessageSend() {
            return {
                auth: false as const,
                params: type.Object({
                    platform: type.Union([type.Literal('slack'), type.Literal('viber')]),
                    account: type.Optional(type.String()),
                    conversationId: type.String(),
                    text: type.Optional(type.String()),
                    attachments: type.Optional(type.Array(type.Unknown())),
                    prompt: type.Optional(type.Unknown()),
                }),
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
