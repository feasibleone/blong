import {validation} from '@feasibleone/blong';

export default validation(
    async ({lib: {type}}) =>
        function gatewayBundleMerge() {
            return {
                params: type.Object(
                    {
                        bundle: type.Optional(
                            type.Record(
                                type.String(),
                                type.Object({
                                    roleBit: type.Optional(type.Integer()),
                                    capability: type.Optional(type.String()),
                                    actions: type.Optional(type.String()),
                                    baseMonthlyCredits: type.Optional(type.Integer()),
                                    rateLimit: type.Optional(type.Integer()),
                                    rateWindowSec: type.Optional(type.Integer()),
                                    isActive: type.Optional(type.Boolean()),
                                    description: type.Optional(
                                        type.Union([type.String(), type.Null()]),
                                    ),
                                }),
                            ),
                        ),
                    },
                    {additionalProperties: true},
                ),
                result: type.Object({success: type.Boolean()}, {additionalProperties: true}),
            };
        },
);
