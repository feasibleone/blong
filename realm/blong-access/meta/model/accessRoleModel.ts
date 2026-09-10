import {model} from '@feasibleone/blong';

/**
 * accessRoleModel — role management (Browse/New/Open).
 *
 * `roleName` is the display name (lives in `core_resource.resourceName`, not a
 * table column) and is provided by the custom `access.role.find/get/add/edit`
 * handlers. The `capability` detail is a pivot grid over the
 * `access.capability` dropdown backed by the `hasCapability` graph edges.
 */
export default model(
    () =>
        async function accessRoleModel() {
            return {
                subject: 'access',
                object: 'role',
                objectTitle: 'Role',
                public: true,
                nameField: 'role.roleName',

                schema: {
                    properties: {
                        role: {
                            properties: {
                                roleName: {
                                    title: 'Name',
                                    filter: true,
                                    sort: true,
                                },
                                roleBit: {
                                    title: 'Bit',
                                    default: 0,
                                    filter: true,
                                },
                                description: {
                                    title: 'Description',
                                    widget: {type: 'textArea'},
                                },
                                // server schema defined:
                                // roleId: {},
                            },
                            widget: {
                                columns: ['roleName', 'roleBit', 'description'],
                            },
                        },
                        capability: {
                            items: {
                                properties: {
                                    capabilityId: {},
                                    capabilityName: {
                                        title: 'Capability',
                                        readOnly: true,
                                    },
                                    granted: {
                                        title: 'Granted',
                                        type: 'boolean',
                                    },
                                },
                            },
                            widget: {
                                type: 'table',
                                pivot: {
                                    dropdown: 'access.capability',
                                    join: {
                                        value: 'capabilityId',
                                        label: 'capabilityName',
                                    },
                                },
                                columns: ['capabilityName', 'granted'],
                            },
                        },
                    },
                },

                details: [{object: 'capability'}],

                cards: {
                    browse: {
                        label: 'Roles',
                        widgets: ['role'],
                    },
                    edit: {
                        label: 'Role Details',
                        className: 'col-12 md:col-8',
                        widgets: ['role.roleName', 'role.roleBit', 'role.description'],
                    },
                },

                browser: {
                    title: 'Roles',
                    icon: 'pi pi-key',
                },
            };
        },
);
