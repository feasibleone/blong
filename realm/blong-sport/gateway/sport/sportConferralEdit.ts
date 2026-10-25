import {validation} from '@feasibleone/blong';

/**
 * `sport.conferral.edit` — same shape as the add: the kind follows the recipient
 * the handler reads, so the payload need not carry it. @@D-598
 */
export default validation(
    async ({lib: {type}}) =>
        function sportConferralEdit() {
            return {
                params: type.Object({
                    conferral: type.Object({}, {additionalProperties: true}),
                }),
                result: type.Object({conferral: type.Object({}, {additionalProperties: true})}),
            };
        },
);
