import {validation} from '@feasibleone/blong';

/** `sport.specialist.remove` — the key only. @@D-596 */
export default validation(
    async ({lib: {type}}) =>
        function sportSpecialistRemove() {
            return {
                params: type.Object({}, {additionalProperties: true}),
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
