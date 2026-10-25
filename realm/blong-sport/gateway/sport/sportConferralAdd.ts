import {validation} from '@feasibleone/blong';

/**
 * `sport.conferral.add` — `recipientKind` is derived, not sent.
 *
 * The generated validation would demand the kind the operator cannot know; the
 * handler reads it from `core_resource` before the row is written. @@D-598
 */
export default validation(
    async ({lib: {type}}) =>
        function sportConferralAdd() {
            return {
                params: type.Object({
                    conferral: type.Object({}, {additionalProperties: true}),
                }),
                result: type.Object({conferral: type.Object({}, {additionalProperties: true})}),
            };
        },
);
