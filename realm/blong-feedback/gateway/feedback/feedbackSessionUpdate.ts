import {validation} from '@feasibleone/blong';

/**
 * `feedback.session.update` — mark a batch processed (`@@T-472`).
 *
 * Bulk by shape: the selection the reviewer made is the payload, so the queue
 * shrinks in one call rather than one round trip per session (`@@D-663`).
 */
export default validation(
    async ({lib: {type}}) =>
        function feedbackSessionUpdate() {
            return {
                params: type.Object({
                    sessionIds: type.Array(type.String()),
                    status: type.Optional(
                        type.Union([type.Literal('new'), type.Literal('processed')]),
                    ),
                }),
                result: type.Object({updated: type.Number()}),
            };
        },
);
