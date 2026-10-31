import {validation} from '@feasibleone/blong';

/**
 * `agent.session.get` — one session by id, with its states.
 *
 * The read a console or a person uses to see what the agent is doing, so it is the one session method
 * that changes nothing (`@@T-564`).
 */
export default validation(
    async ({lib: {type}}) =>
        function agentSessionGet() {
            return {
                params: type.Object({sessionId: type.String({format: 'uuid'})}),
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
