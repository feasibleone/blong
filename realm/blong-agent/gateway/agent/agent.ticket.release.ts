import {validation} from '@feasibleone/blong';

/** `agent.ticket.release` — close a ticket, or hand it back to the pool (`@@T-564`). */
export default validation(
    async ({lib: {type}}) =>
        function agentTicketRelease() {
            return {
                params: type.Object({
                    ticketId: type.String({maxLength: 64}),
                    workerId: type.String({maxLength: 128}),
                    ticketStatus: type.Optional(
                        type.Union([
                            type.Literal('todo'),
                            type.Literal('done'),
                            type.Literal('failed'),
                        ]),
                    ),
                    summary: type.Optional(type.String({maxLength: 8000})),
                }),
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
