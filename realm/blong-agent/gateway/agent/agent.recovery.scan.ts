import {validation} from '@feasibleone/blong';

/**
 * `agent.recovery.scan` — ask about the sessions this host left suspended.
 *
 * A person's answer decides what happens to each one, so the call blocks on the question rather than
 * acting on a guess (`@@T-564`).
 */
export default validation(
    async ({lib: {type}}) =>
        function agentRecoveryScan() {
            return {
                params: type.Object({
                    workerId: type.Optional(type.String({maxLength: 128})),
                    limit: type.Optional(type.Integer({minimum: 1, maximum: 100})),
                }),
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
