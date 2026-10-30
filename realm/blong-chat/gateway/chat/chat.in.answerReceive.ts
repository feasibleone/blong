import {validation} from '@feasibleone/blong';

/**
 * `chat.in.answerReceive` — the event path of a question.
 *
 * A caller that cannot hold a request open sends the controls through `chat.out.messageSend` and
 * takes the answer here; the same method is what the platform's own reply reaches, so the two paths
 * cannot disagree about what an answer is (`@@D-678`).
 */
export default validation(
    async ({lib: {type}}) =>
        function chatInAnswerReceive() {
            return {
                auth: false as const,
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
