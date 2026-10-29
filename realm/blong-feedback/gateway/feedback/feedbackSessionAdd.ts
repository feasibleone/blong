import {validation} from '@feasibleone/blong';

/**
 * `feedback.session.add` — one submission in, its identifier out (`@@T-472`).
 *
 * The payload is the contract in `@feasibleone/blong` (`IFeedbackSessionInput`);
 * the result is deliberately small, because the review page reads the stored
 * rows rather than echoing back what it sent.
 */
export default validation(
    async ({lib: {type}}) =>
        function feedbackSessionAdd() {
            return {
                params: type.Object({session: type.Unknown()}),
                result: type.Object({
                    sessionId: type.String(),
                    itemCount: type.Number(),
                }),
            };
        },
);
