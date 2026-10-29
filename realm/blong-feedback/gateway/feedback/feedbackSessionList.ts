import {validation} from '@feasibleone/blong';

/** `feedback.session.list` — the review queue, newest first (`@@T-473`). */
export default validation(
    async ({lib: {type}}) =>
        function feedbackSessionList() {
            return {
                params: type.Object({
                    status: type.Optional(
                        type.Union([type.Literal('new'), type.Literal('processed'), type.Null()]),
                    ),
                    limit: type.Optional(type.Number()),
                }),
                result: type.Object({sessions: type.Array(type.Unknown())}),
            };
        },
);
