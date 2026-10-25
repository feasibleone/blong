import {validation} from '@feasibleone/blong';

/** `sport.coach.edit` — flat person + coach payload, key included. */
export default validation(
    async ({lib: {type}}) =>
        function sportCoachEdit() {
            return {
                params: type.Object({coach: type.Object({}, {additionalProperties: true})}),
                result: type.Object({coach: type.Object({}, {additionalProperties: true})}),
            };
        },
);
