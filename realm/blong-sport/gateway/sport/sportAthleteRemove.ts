import {validation} from '@feasibleone/blong';

/** `sport.athlete.remove` — the key only; the row is read by the handler. @@D-596 */
export default validation(
    async ({lib: {type}}) =>
        function sportAthleteRemove() {
            return {
                params: type.Object({}, {additionalProperties: true}),
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
