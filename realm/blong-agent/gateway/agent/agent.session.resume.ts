import {validation} from '@feasibleone/blong';

/** `agent.session.resume` — continue a suspended session, with or without the answer it waited for. */
export default validation(
    async ({lib: {type}}) =>
        function agentSessionResume() {
            return {
                params: type.Object({
                    sessionId: type.String({format: 'uuid'}),
                    workerId: type.Optional(type.String({maxLength: 128})),
                    answer: type.Optional(
                        type.Object({
                            promptId: type.String({maxLength: 64}),
                            answerText: type.String({maxLength: 8000}),
                            senderName: type.Optional(type.String({maxLength: 255})),
                        }),
                    ),
                }),
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
