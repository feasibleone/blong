import {validation} from '@feasibleone/blong';

/**
 * `access.acl.add` — explicit validation override.
 *
 * The auto-generated schema requires `aclId` (the row's ULID) and would reject
 * the virtual display fields the editor round-trips; the server generates the id
 * and the handler drops the virtuals.
 */
export default validation(
    async ({lib: {type}}) =>
        function accessAclAdd() {
            return {
                params: type.Object(
                    {
                        acl: type.Optional(
                            type.Object(
                                {
                                    aclId: type.Optional(type.String()),
                                    /** Principal resource (user / role / unit / capability). */
                                    principalId: type.Optional(type.String()),
                                    /** Action resource (`access_action`). */
                                    actionId: type.Optional(type.String()),
                                    /** `record` or `scope`. */
                                    targetKind: type.Optional(type.String()),
                                    /** Guarded record, or a scope node. */
                                    targetId: type.Optional(type.String()),
                                    /** `allow` or `deny`. */
                                    effect: type.Optional(type.String()),
                                    isActive: type.Optional(
                                        type.Union([
                                            type.Boolean(),
                                            type.Literal(0),
                                            type.Literal(1),
                                        ]),
                                    ),
                                    // Virtual display fields joined by find/get.
                                    principalName: type.Optional(type.String()),
                                    actionName: type.Optional(type.String()),
                                    targetName: type.Optional(type.String()),
                                },
                                {additionalProperties: true},
                            ),
                        ),
                    },
                    {additionalProperties: true},
                ),
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
