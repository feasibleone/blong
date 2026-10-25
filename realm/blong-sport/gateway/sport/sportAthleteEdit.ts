import {validation} from '@feasibleone/blong';

/** `sport.athlete.edit` — the flat profile payload, key included. @@D-596 */
export default validation(
    async ({lib: {type}}) =>
        function sportAthleteEdit() {
            return {
                params: type.Object({
                    athlete: type.Object({}, {additionalProperties: true}),
                }),
                result: type.Object({athlete: type.Object({}, {additionalProperties: true})}),
            };
        },
);
