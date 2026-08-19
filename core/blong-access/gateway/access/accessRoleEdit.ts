import {validation} from '@feasibleone/blong';

/**
 * `access.role.edit` — explicit validation override matching the custom
 * handler's accepted shape (`role` key + optional `capability` detail array).
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
                                roleBit: type.Optional(type.Integer()),
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
                    },
                    {additionalProperties: true},
                ),
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
