import {validation} from '@feasibleone/blong';

/**
 * `agent.answer.receive` — an answer to a question the agent asked.
 *
 * Idempotent on the prompt id, so a platform retrying a click is safe. This is the route a chat realm's
 * consumer forwards to, which is why it takes the flat fields rather than an envelope (`@@T-564`).
 */
export default validation(
    async ({lib: {type}}) =>
        function agentAnswerReceive() {
            return {
                params: type.Object({
                    promptId: type.String({maxLength: 64}),
                    answerText: type.String({maxLength: 8000}),
                    ticketId: type.Optional(type.String({maxLength: 64})),
                    sessionId: type.Optional(type.String({format: 'uuid'})),
                    senderName: type.Optional(type.String({maxLength: 255})),
                }),
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
