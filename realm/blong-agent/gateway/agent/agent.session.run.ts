import {validation} from '@feasibleone/blong';

/**
 * `agent.session.run` — drive a session that was claimed but has not been run.
 *
 * The worker calls this; a person may too, to nudge a session forward, which is why the answer it may
 * carry is optional rather than a separate method (`@@T-564`).
 */
export default validation(
    async ({lib: {type}}) =>
        function agentSessionRun() {
            return {
                params: type.Object({
                    sessionId: type.String({format: 'uuid'}),
                    workerId: type.Optional(type.String({maxLength: 128})),
                    prompt: type.Optional(type.String({maxLength: 8000})),
                    instructions: type.Optional(type.String({maxLength: 8000})),
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
