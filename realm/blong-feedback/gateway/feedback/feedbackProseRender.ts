import {validation} from '@feasibleone/blong';

/**
 * `feedback.prose.render` — the Markdown for a batch (`@@T-472`).
 *
 * The selection is either explicit ids or the `new` queue; nothing is stored, so
 * the same call may be repeated whenever the reviewer wants a fresh document
 * (`@@D-660`, `@@D-663`).
 */
export default validation(
    async ({lib: {type}}) =>
        function feedbackProseRender() {
            return {
                params: type.Object({
                    sessionIds: type.Optional(type.Array(type.String())),
                    status: type.Optional(type.Union([type.Literal('new'), type.Literal('processed')])),
                }),
                result: type.Object({
                    document: type.String(),
                    sessionIds: type.Array(type.String()),
                    itemCount: type.Number(),
                }),
            };
        },
);
