import {validation} from '@feasibleone/blong';

/**
 * `chat.out.messageSend` — the one way to speak into a chat from outside the process.
 *
 * Authenticated: it makes a bot post, which is a write into a conversation and is granted to the
 * managing capability rather than to a reader's (`@@D-802`). The route was left open in the first
 * pass, when the realm carried no users and the deployment's address was the only protection — a
 * host is not an authority, and the realm has one beside it now. The prompt is passed as `unknown`
 * rather than restated, because its shape belongs to `IChatPrompt` in `@feasibleone/blong` and a
 * second definition here would be the one that drifts.
 */
export default validation(
    async ({lib: {type}}) =>
        function chatOutMessageSend() {
            return {
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
