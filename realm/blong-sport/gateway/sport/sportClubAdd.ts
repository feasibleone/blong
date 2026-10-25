import {validation} from '@feasibleone/blong';

/** `sport.club.add` — flat organisation + club payload. */
export default validation(
    async ({lib: {type}}) =>
        function sportClubAdd() {
            return {
                params: type.Object({club: type.Object({}, {additionalProperties: true})}),
                result: type.Object({club: type.Object({}, {additionalProperties: true})}),
            };
        },
);
