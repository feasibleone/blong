import {validation} from '@feasibleone/blong';

/** `sport.specialist.edit` — flat person + specialist payload, key included. */
export default validation(
    async ({lib: {type}}) =>
        function sportSpecialistEdit() {
            return {
                params: type.Object({
                    specialist: type.Object({}, {additionalProperties: true}),
                }),
                result: type.Object({specialist: type.Object({}, {additionalProperties: true})}),
            };
        },
);
