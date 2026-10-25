import {validation} from '@feasibleone/blong';

/** `sport.federation.edit` — flat organisation + federation payload, key included. */
export default validation(
    async ({lib: {type}}) =>
        function sportFederationEdit() {
            return {
                params: type.Object({
                    federation: type.Object({}, {additionalProperties: true}),
                }),
                result: type.Object({federation: type.Object({}, {additionalProperties: true})}),
            };
        },
);
