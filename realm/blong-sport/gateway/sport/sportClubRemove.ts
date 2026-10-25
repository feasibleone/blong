import {validation} from '@feasibleone/blong';

/** `sport.club.remove` — the key only. @@D-596 */
export default validation(
    async ({lib: {type}}) =>
        function sportClubRemove() {
            return {
                params: type.Object({}, {additionalProperties: true}),
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
