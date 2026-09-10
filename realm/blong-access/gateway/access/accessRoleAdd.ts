import {validation} from '@feasibleone/blong';

/**
 * `access.role.add` — explicit validation override.
 *
 * The auto-generated schema requires the `uidNotNull` `role.roleId` on add,
 * but the id is generated server-side (`core.resource.ensure`). `roleName` is
 * the resource display name, not a table column.
 */
export default validation(
    async ({lib: {type}}) =>
        function accessRoleAdd() {
            return {
                params: type.Object(
                    {
                        role: type.Optional(
                            type.Object(
                                {
                                    roleName: type.Optional(type.String()),
                                    roleBit: type.Optional(type.Integer()),
                                    description: type.Optional(
                                        type.Union([type.String(), type.Null()]),
                                    ),
                                },
                                {additionalProperties: true},
                            ),
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
                    },
                    {additionalProperties: true},
                ),
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
