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
                                    // Blank (`''` / `null`) asks the handler to
                                    // allocate a free role bit; an explicit value is
                                    // validated there (`role.bitInvalid` /
                                    // `role.bitTaken`).
                                    roleBit: type.Optional(
                                        type.Union([
                                            type.Integer(),
                                            type.Null(),
                                            type.String(),
                                        ]),
                                    ),
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
                        // The scope × CRUD ACL matrix of the "Record Access" tab —
                        // one row per (scope, entity) with a cell per verb (`''`,
                        // `allow`, `deny`, or `null` when the cell was cleared —
                        // the tri-state blank means "no rule").
                        matrix: type.Optional(
                            type.Array(
                                type.Object(
                                    {
                                        targetId: type.Optional(type.String()),
                                        targetName: type.Optional(type.String()),
                                        entityName: type.Optional(type.String()),
                                        find: type.Optional(type.Union([type.String(), type.Null()])),
                                        get: type.Optional(type.Union([type.String(), type.Null()])),
                                        add: type.Optional(type.Union([type.String(), type.Null()])),
                                        edit: type.Optional(type.Union([type.String(), type.Null()])),
                                        remove: type.Optional(type.Union([type.String(), type.Null()])),
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
