import {validation} from '@feasibleone/blong';

/** `sport.federation.get` — the profile payload by key. @@D-596 */
export default validation(
    async ({lib: {type}}) =>
        function sportFederationGet() {
            return {
                params: type.Object({}, {additionalProperties: true}),
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
