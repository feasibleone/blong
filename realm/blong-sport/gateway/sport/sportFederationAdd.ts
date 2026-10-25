import {validation} from '@feasibleone/blong';

/** `sport.federation.add` — flat organisation + federation payload. */
export default validation(
    async ({lib: {type}}) =>
        function sportFederationAdd() {
            return {
                params: type.Object({
                    federation: type.Object({}, {additionalProperties: true}),
                }),
                result: type.Object({federation: type.Object({}, {additionalProperties: true})}),
            };
        },
);
