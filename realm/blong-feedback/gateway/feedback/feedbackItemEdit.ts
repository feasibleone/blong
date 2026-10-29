import {validation} from '@feasibleone/blong';

/**
 * `feedback.item.edit` — the reviewer's edit of one comment (`@@T-472`).
 *
 * The schema is the wire contract, and it has to name every field the page may
 * send: a field the schema does not declare is stripped before the adapter sees
 * it, so the call answers `{updated: 0}` and the reviewer's move or close is lost
 * without an error (`@@F-632`). `callout` is the box the page dragged, in
 * fractions of the picture (`@@T-495`); `removed` closes or restores the comment
 * (`@@T-496`).
 */
export default validation(
    async ({lib: {type}}) =>
        function feedbackItemEdit() {
            return {
                params: type.Object({
                    sessionId: type.String(),
                    itemId: type.String(),
                    commentText: type.Optional(type.String()),
                    refinedText: type.Optional(type.String()),
                    callout: type.Optional(
                        type.Object({
                            x: type.Number(),
                            y: type.Number(),
                            width: type.Number(),
                            height: type.Number(),
                        }),
                    ),
                    removed: type.Optional(type.Boolean()),
                }),
                result: type.Object({updated: type.Number()}),
            };
        },
);
