import {validation} from '@feasibleone/blong';

/** `sport.coach.remove` — the key only. @@D-596 */
export default validation(
    async ({lib: {type}}) =>
        function sportCoachRemove() {
            return {
                params: type.Object({}, {additionalProperties: true}),
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
