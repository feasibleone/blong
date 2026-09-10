import {validation} from '@feasibleone/blong';

/**
 * `access.user.add` — explicit validation override.
 *
 * The auto-generated `subject.validation` schema requires the `uidNotNull`
 * `user.userId` on add, but the id is generated server-side
 * (`core.resource.ensure`). This override replaces it so the New form can
 * submit `{user: {emailAddress, isActive}, credential, role}`.
 */
export default validation(
    async ({lib: {type}}) =>
        function accessUserAdd() {
            return {
                params: type.Object(
                    {
                        user: type.Optional(
                            type.Object(
                                {
                                    userName: type.Optional(type.String()),
                                    emailAddress: type.Optional(
                                        type.Union([type.String(), type.Null()]),
                                    ),
                                    isActive: type.Optional(
                                        type.Union([
                                            type.Boolean(),
                                            type.Literal(0),
                                            type.Literal(1),
                                        ]),
                                    ),
                                },
                                {additionalProperties: true},
                            ),
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
