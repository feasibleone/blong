import {validation} from '@feasibleone/blong';

/** `sport.specialist.add` — flat person + specialist payload. */
export default validation(
    async ({lib: {type}}) =>
        function sportSpecialistAdd() {
            return {
                params: type.Object({
                    specialist: type.Object({}, {additionalProperties: true}),
                }),
                result: type.Object({specialist: type.Object({}, {additionalProperties: true})}),
            };
        },
);
