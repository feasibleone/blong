import {validation} from '@feasibleone/blong';

/**
 * `access.capability.add` — explicit validation override.
 *
 * The auto-generated schema requires the `uidNotNull` `capability.capabilityId`
 * on add, but the id is generated server-side. `capabilityName` is the resource
 * display name, not a table column.
 */
export default validation(
    async ({lib: {type}}) =>
        function accessCapabilityAdd() {
            return {
                params: type.Object(
                    {
                        capability: type.Optional(
                            type.Object(
                                {
                                    capabilityName: type.Optional(type.String()),
                                    description: type.Optional(
                                        type.Union([type.String(), type.Null()]),
                                    ),
                                },
                                {additionalProperties: true},
                            ),
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
