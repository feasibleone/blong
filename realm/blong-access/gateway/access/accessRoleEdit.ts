import {validation} from '@feasibleone/blong';

/**
 * `access.role.edit` — explicit validation override matching the custom
 * handler's accepted shape (`role` key + optional `capability` detail array and
 * the scope × CRUD `matrix` of the "Record Access" tab).
 */
export default validation(
    async ({lib: {type}}) =>
        function accessRoleEdit() {
            return {
                params: type.Object(
                    {
                        role: type.Object(
                            {
                                roleId: type.String(),
                                roleName: type.Optional(type.String()),
                                // Still accepted for compatibility, but a bit never
                                // changes: the handler refuses a different value
                                // (`role.bitImmutable`) and ignores the column.
                                roleBit: type.Optional(
                                    type.Union([type.Integer(), type.Null(), type.String()]),
                                ),
                                description: type.Optional(
                                    type.Union([type.String(), type.Null()]),
                                ),
                            },
                            {additionalProperties: true},
                        ),
                        capability: type.Optional(
                            type.Array(
                                type.Object(
                                    {
                                        capabilityId: type.Optional(type.String()),
                                        capabilityName: type.Optional(type.String()),
                                    },
                                    {additionalProperties: true},
                                ),
                            ),
                        ),
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
