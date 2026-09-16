import {validation} from '@feasibleone/blong';

/**
 * `access.acl.edit` — explicit validation override.
 *
 * Same shape as `access.acl.add`: the auto-generated schema would reject the
 * virtual display fields the editor round-trips (the handler drops them).
 */
export default validation(
    async ({lib: {type}}) =>
        function accessAclEdit() {
            return {
                params: type.Object(
                    {
                        acl: type.Object(
                            {
                                aclId: type.Optional(type.String()),
                                principalId: type.Optional(type.String()),
                                actionId: type.Optional(type.String()),
                                targetKind: type.Optional(type.String()),
                                targetId: type.Optional(type.String()),
                                effect: type.Optional(type.String()),
                                isActive: type.Optional(
                                    type.Union([type.Boolean(), type.Literal(0), type.Literal(1)]),
                                ),
                                principalName: type.Optional(type.String()),
                                actionName: type.Optional(type.String()),
                                targetName: type.Optional(type.String()),
                            },
                            {additionalProperties: true},
                        ),
                    },
                    {additionalProperties: true},
                ),
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
