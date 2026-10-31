import {validation} from '@feasibleone/blong';

/**
 * `agent.ticket.claim` — take one free ticket and open the session beside it.
 *
 * Authenticated: claiming is what decides which work this host runs, so an anonymous caller must not be
 * able to take a ticket out of the pool (`@@T-564`).
 */
export default validation(
    async ({lib: {type}}) =>
        function agentTicketClaim() {
            return {
                params: type.Object({
                    workerId: type.String({maxLength: 128}),
                    engineAdapter: type.Optional(type.String({maxLength: 64})),
                    engineAccount: type.Optional(type.String({maxLength: 64})),
                    engineMode: type.Optional(
                        type.Union([type.Literal('step'), type.Literal('native')]),
                    ),
                    leaseMs: type.Optional(type.Integer({minimum: 1_000})),
                }),
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
