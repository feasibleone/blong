import {validation} from '@feasibleone/blong';

/** `sport.coach.add` — flat person + coach payload. */
export default validation(
    async ({lib: {type}}) =>
        function sportCoachAdd() {
            return {
                params: type.Object({coach: type.Object({}, {additionalProperties: true})}),
                result: type.Object({coach: type.Object({}, {additionalProperties: true})}),
            };
        },
);
