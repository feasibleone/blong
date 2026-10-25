import {validation} from '@feasibleone/blong';

/** `sport.club.edit` — flat organisation + club payload, key included. */
export default validation(
    async ({lib: {type}}) =>
        function sportClubEdit() {
            return {
                params: type.Object({club: type.Object({}, {additionalProperties: true})}),
                result: type.Object({club: type.Object({}, {additionalProperties: true})}),
            };
        },
);
