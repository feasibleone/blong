import {validation} from '@feasibleone/blong';

/**
 * `access.user.edit` — explicit validation override matching the custom
 * handler's accepted shape (`user` key + optional `credential` / `role` detail
 * arrays and the scope × CRUD `matrix`). The auto-generated schema would
 * require the full `user` record.
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
                        // The scope × CRUD ACL matrix of the "Record Access" tab.
                        // A cell may be `null`: the tri-state blank means "no
                        // rule", which is how a rule is released.
                        matrix: type.Optional(
                            type.Array(
                                type.Object(
                                    {
                                        targetId: type.Optional(type.String()),
                                        targetName: type.Optional(type.String()),
                                        entityName: type.Optional(type.String()),
                                        find: type.Optional(
                                            type.Union([type.String(), type.Null()]),
                                        ),
                                        get: type.Optional(
                                            type.Union([type.String(), type.Null()]),
                                        ),
                                        add: type.Optional(
                                            type.Union([type.String(), type.Null()]),
                                        ),
                                        edit: type.Optional(
                                            type.Union([type.String(), type.Null()]),
                                        ),
                                        remove: type.Optional(
                                            type.Union([type.String(), type.Null()]),
                                        ),
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
