import {validation} from '@feasibleone/blong';

export default validation(
    async ({lib: {type}}) =>
        function loginTokenCreate() {
            return {
                auth: 'login',
                params: type.Object({
                    grantType: type.Optional(
                        type.Union([type.Literal('password'), type.Literal('client_credentials')]),
                    ),
                    username: type.Optional(type.String()),
                    password: type.Optional(type.String()),
                    clientId: type.Optional(type.String()),
                    clientSecret: type.Optional(type.String()),
                }),
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
