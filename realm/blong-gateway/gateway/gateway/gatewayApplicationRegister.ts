import {validation} from '@feasibleone/blong';

export default validation(
    async ({lib: {type}}) =>
        function gatewayApplicationRegister() {
            return {
                params: type.Object({
                    clientId: type.String(),
                    ownerUserId: type.Optional(type.String()),
                    applicationType: type.Optional(type.String()),
                    description: type.Optional(type.Union([type.String(), type.Null()])),
                    isActive: type.Optional(type.Boolean()),
                }),
                result: type.Object(
                    {
                        applicationId: type.String(),
                        clientId: type.String(),
                        clientSecret: type.String(),
                    },
                    {additionalProperties: true},
                ),
            };
        },
);
