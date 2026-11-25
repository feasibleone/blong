import {validation} from '@feasibleone/blong';

/**
 * `agent.session.find` — the sessions a caller can list, with what they add up to (`T-792`).
 *
 * The list is read from the projection beside the session row, so a page draws without replaying a
 * topic (`@@D-992`). Paging is by `updatedAt`: `before` is the last timestamp of the page a reader
 * already has, which keeps a session that moved to the top from shifting a page under the reader the
 * way an offset does.
 */
export default validation(
    async ({lib: {type}}) =>
        function agentSessionFind() {
            return {
                params: type.Object({
                    ticketId: type.Optional(type.String({maxLength: 64})),
                    status: type.Optional(type.String({maxLength: 32})),
                    workerId: type.Optional(type.String({maxLength: 128})),
                    channelKey: type.Optional(type.String({maxLength: 255})),
                    source: type.Optional(type.String({maxLength: 16})),
                    personaId: type.Optional(type.String({maxLength: 64})),
                    /** The last `updatedAt` of the page the reader has. */
                    before: type.Optional(type.String({maxLength: 40})),
                    limit: type.Optional(type.Number()),
                }),
                result: type.Object({
                    sessions: type.Array(type.Object({}, {additionalProperties: true})),
                    /** The cursor of the next page, when there is one. */
                    next: type.Optional(type.String()),
                }),
            };
        },
);
