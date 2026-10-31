import {validation} from '@feasibleone/blong';

/**
 * `agent.worker.tick` — one pass of the worker, callable by hand.
 *
 * A deployment's own scheduler or a test calls this; the port's interval is the ordinary path, so the
 * method exists to make one pass reproducible (`@@T-564`).
 */
export default validation(
    async ({lib: {type}}) =>
        function agentWorkerTick() {
            return {
                params: type.Object({
                    workerId: type.Optional(type.String({maxLength: 128})),
                    engineAdapter: type.Optional(type.String({maxLength: 64})),
                    engineAccount: type.Optional(type.String({maxLength: 64})),
                    engineMode: type.Optional(
                        type.Union([type.Literal('step'), type.Literal('native')]),
                    ),
                }),
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
