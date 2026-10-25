import {validation} from '@feasibleone/blong';

/** `sport.club.get` — the profile payload by key. @@D-596 */
export default validation(
    async ({lib: {type}}) =>
        function sportClubGet() {
            return {
                params: type.Object({}, {additionalProperties: true}),
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
