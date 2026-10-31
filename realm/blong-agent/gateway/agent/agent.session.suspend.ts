import {validation} from '@feasibleone/blong';

/** `agent.session.suspend` — stop waiting and keep everything needed for a later resume. */
export default validation(
    async ({lib: {type}}) =>
        function agentSessionSuspend() {
            return {
                params: type.Object({
                    sessionId: type.String({format: 'uuid'}),
                    promptId: type.Optional(type.String({maxLength: 64})),
                    reason: type.Optional(
                        type.Union([
                            type.Literal('question'),
                            type.Literal('shutdown'),
                            type.Literal('timeout'),
                        ]),
                    ),
                }),
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
