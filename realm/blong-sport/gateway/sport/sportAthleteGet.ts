import {validation} from '@feasibleone/blong';

/**
 * `sport.athlete.get` — the profile payload by key.
 *
 * The generated validation describes the profile table, which the flat payload
 * the handler assembles does not match: a rejected read leaves the edit form
 * empty. @@D-596
 */
export default validation(
    async ({lib: {type}}) =>
        function sportAthleteGet() {
            return {
                params: type.Object({}, {additionalProperties: true}),
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
