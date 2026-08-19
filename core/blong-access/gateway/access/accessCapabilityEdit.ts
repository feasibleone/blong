import {validation} from '@feasibleone/blong';

/**
 * `access.capability.edit` — explicit validation override matching the custom
 * handler's accepted shape (`capability` key + optional `action` / `otherAction`
 * detail arrays).
 */
export default validation(
    async ({lib: {type}}) =>
        function accessCapabilityEdit() {
            return {
                params: type.Object(
                    {
                        capability: type.Object(
                            {
                                capabilityId: type.String(),
                                capabilityName: type.Optional(type.String()),
                                description: type.Optional(
                                    type.Union([type.String(), type.Null()]),
                                ),
                            },
                            {additionalProperties: true},
                        ),
                        action: type.Optional(
                            type.Array(
                                type.Object(
                                    {
                                        entityName: type.Optional(type.String()),
                                        find: type.Optional(type.Boolean()),
                                        get: type.Optional(type.Boolean()),
                                        add: type.Optional(type.Boolean()),
                                        edit: type.Optional(type.Boolean()),
                                        remove: type.Optional(type.Boolean()),
                                    },
                                    {additionalProperties: true},
                                ),
                            ),
                        ),
                        otherAction: type.Optional(
                            type.Array(
                                type.Object(
                                    {
                                        actionId: type.Optional(type.String()),
                                        granted: type.Optional(type.Boolean()),
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
