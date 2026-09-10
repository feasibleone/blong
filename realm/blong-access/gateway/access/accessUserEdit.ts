import {validation} from '@feasibleone/blong';

/**
 * `access.user.edit` — explicit validation override matching the custom
 * handler's accepted shape (`user` key + optional `credential` / `role` detail
 * arrays). The auto-generated schema would require the full `user` record.
 */
export default validation(
    async ({lib: {type}}) =>
        function accessUserEdit() {
            return {
                params: type.Object(
                    {
                        user: type.Object(
                            {
                                userId: type.String(),
                                emailAddress: type.Optional(
                                    type.Union([type.String(), type.Null()]),
                                ),
                                isActive: type.Optional(
                                    type.Union([type.Boolean(), type.Literal(0), type.Literal(1)]),
                                ),
                            },
                            {additionalProperties: true},
                        ),
                        credential: type.Optional(
                            type.Array(type.Object({}, {additionalProperties: true})),
                        ),
                        role: type.Optional(
                            type.Array(
                                type.Object(
                                    {
                                        roleId: type.Optional(type.String()),
                                        roleName: type.Optional(type.String()),
                                    },
                                    {additionalProperties: true},
                                ),
                            ),
                        ),
                    },
                    {additionalProperties: true},
                ),
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
