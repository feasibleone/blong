import {validation} from '@feasibleone/blong';

export default validation(
    async ({lib: {type}}) =>
        function gatewayCreditAdjust() {
            return {
                params: type.Object({
                    applicationId: type.String(),
                    delta: type.Integer(),
                    month: type.Optional(type.String()),
                }),
                result: type.Object({balance: type.Integer()}, {additionalProperties: true}),
            };
        },
);
