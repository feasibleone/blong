import {validation} from '@feasibleone/blong';

/**
 * `chat.prompt.ask` — ask a question over chat and wait for the answer.
 *
 * The request stays open until somebody answers or the timeout fires, so this is the route a caller
 * uses when it wants the answer rather than a notification (`@@D-678`). The controls are the four the
 * vocabulary names; which of them a platform can render is the port's decision, and a refusal comes
 * back as a typed error rather than as a differently-shaped question.
 */
export default validation(
    async ({lib: {type}}) =>
        function chatPromptAsk() {
            return {
                auth: false as const,
                params: type.Object({
                    platform: type.Union([type.Literal('slack'), type.Literal('viber')]),
                    account: type.Optional(type.String()),
                    conversationId: type.String(),
                    text: type.String(),
                    kind: type.Union([
                        type.Literal('choice'),
                        type.Literal('multiChoice'),
                        type.Literal('text'),
                        type.Literal('confirm'),
                    ]),
                    options: type.Optional(
                        type.Array(
                            type.Object({
                                value: type.String(),
                                label: type.String(),
                                description: type.Optional(type.String()),
                            }),
                        ),
                    ),
                    placeholder: type.Optional(type.String()),
                    timeoutMs: type.Optional(type.Number()),
                    // On unless the question says otherwise: a control disappears once used, so the
                    // answer is the only record the conversation keeps of the question.
                    echoAnswer: type.Optional(type.Boolean()),
                    // Inline unless the question asks for a form: the controls belong where the
                    // question was asked, and a dialog is the exception rather than the rule.
                    presentation: type.Optional(
                        type.Union([type.Literal('inline'), type.Literal('form')]),
                    ),
                }),
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
