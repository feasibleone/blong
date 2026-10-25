import {validation} from '@feasibleone/blong';

/** `sport.federation.remove` — the key only. @@D-596 */
export default validation(
    async ({lib: {type}}) =>
        function sportFederationRemove() {
            return {
                params: type.Object({}, {additionalProperties: true}),
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
