import {validation} from '@feasibleone/blong';

/** `feedback.session.items` — one session with its comments and their anchors (`@@T-472`). */
export default validation(
    async ({lib: {type}}) =>
        function feedbackSessionItems() {
            return {
                params: type.Object({sessionId: type.String()}),
                result: type.Object({
                    session: type.Unknown(),
                    items: type.Array(type.Unknown()),
                }),
            };
        },
);
