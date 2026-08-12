import {validation} from '@feasibleone/blong';

export default validation(
    async ({lib: {type}}) =>
        function gatewaySubscriptionMerge() {
            return {
                params: type.Object(
                    {
                        subscription: type.Optional(
                            type.Record(
                                type.String(),
                                type.Object({
                                    application: type.Optional(type.String()),
                                    bundle: type.Optional(type.String()),
                                    status: type.Optional(type.String()),
                                    startsAt: type.Optional(type.String()),
                                    endsAt: type.Optional(type.Union([type.String(), type.Null()])),
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
