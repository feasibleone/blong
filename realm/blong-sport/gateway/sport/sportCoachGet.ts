import {validation} from '@feasibleone/blong';

/** `sport.coach.get` — the profile payload by key. @@D-596 */
export default validation(
    async ({lib: {type}}) =>
        function sportCoachGet() {
            return {
                params: type.Object({}, {additionalProperties: true}),
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
