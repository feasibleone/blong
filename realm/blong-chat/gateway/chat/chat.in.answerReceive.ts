import {validation} from '@feasibleone/blong';

/**
 * `chat.in.answerReceive` — the event path of a question.
 *
 * A caller that cannot hold a request open sends the controls through `chat.out.messageSend` and
 * takes the answer here; the same method is what the platform's own reply reaches, so the two paths
 * cannot disagree about what an answer is (`@@D-678`).
 *
 * Authenticated: answering is as much a write into a conversation as asking, so it answers to the
 * same authority (`@@D-802`). The platform's own reply does not come through this route — the
 * webhook is served by the port, not the gateway — so requiring a bearer here costs a bot nothing.
 */
export default validation(
    async ({lib: {type}}) =>
        function chatInAnswerReceive() {
            return {
                params: type.Object({
                    platform: type.Union([type.Literal('slack'), type.Literal('viber')]),
                    account: type.Optional(type.String()),
                    conversationId: type.String(),
                    promptId: type.String(),
                    value: type.Optional(type.String()),
                    values: type.Optional(type.Array(type.String())),
                    text: type.Optional(type.String()),
                }),
                result: type.Object({handled: type.Boolean()}),
            };
        },
);
