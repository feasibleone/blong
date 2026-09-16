import {model} from '@feasibleone/blong';

/**
 * Tri-state ACL cell: clicking cycles allow → deny → blank (no rule — RBAC
 * alone), so the matrix is edited without row-edit mode.  `label` is the cell's
 * accessible name and what the Playwright helper matches on.
 */
const ACL_MATRIX_CELL = {
    type: 'cycle',
    states: [
        {value: 'allow', icon: 'pi pi-check text-green-500', label: 'Allow'},
        {value: 'deny', icon: 'pi pi-times text-red-500', label: 'Deny'},
        {value: null, label: 'Not set'},
    ],
};

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
                                    // No default on purpose: an empty field asks
                                    // `access.role.add` to allocate a free bit,
                                    // and a bit never moves once assigned.
                                    title: 'Bit',
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
                        effective: {
                            title: 'Effective Access',
                            items: {
                                properties: {
                                    principalName: {title: 'Granted via', readOnly: true},
                                    source: {title: 'Source', readOnly: true},
                                    actionName: {title: 'Action', readOnly: true},
                                    targetKind: {title: 'Kind', readOnly: true},
                                    targetName: {title: 'Target', readOnly: true},
                                    effect: {title: 'Effect', readOnly: true},
                                },
                            },
                            widget: {
                                type: 'table',
                                columns: [
                                    'principalName',
                                    'source',
                                    'actionName',
                                    'targetKind',
                                    'targetName',
                                    'effect',
                                ],
                                actions: {allowAdd: false, allowEdit: false, allowDelete: false},
                            },
                        },
                        matrix: {
                            title: 'Record Access (ACL)',
                            items: {
                                properties: {
                                    targetId: {
                                        title: 'Scope',
                                        widget: {type: 'dropdown', dropdown: 'access.aclTarget'},
                                    },
                                    targetName: {title: 'Scope', readOnly: true, filter: true},
                                    // Fixed per matrix: the row identity is the
                                    // scope, the entity comes from the pivot
                                    // defaults (`partyPerson`).
                                    entityName: {title: 'Entity', readOnly: true, filter: true},
                                    find: {title: 'Find', widget: ACL_MATRIX_CELL},
                                    get: {title: 'Get', widget: ACL_MATRIX_CELL},
                                    add: {title: 'Add', widget: ACL_MATRIX_CELL},
                                    edit: {title: 'Edit', widget: ACL_MATRIX_CELL},
                                    remove: {title: 'Remove', widget: ACL_MATRIX_CELL},
                                },
                            },
                            widget: {
                                type: 'table',
                                pivot: {
                                    dropdown: 'access.aclTarget',
                                    join: {value: 'targetId', label: 'targetName'},
                                    defaults: {entityName: 'partyPerson'},
                                },
                                columns: [
                                    'targetName',
                                    'entityName',
                                    'find',
                                    'get',
                                    'add',
                                    'edit',
                                    'remove',
                                ],
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
                    'details-effective': {label: 'Access', widgets: ['effective']},
                    'details-matrix': {label: 'Record Access', widgets: ['matrix']},
                },

                layouts: {
                    edit: {
                        items: [
                            {id: 'edit', label: 'Role', widgets: ['edit']},
                            {
                                id: 'capability',
                                label: 'Capability',
                                widgets: ['details-capability'],
                            },
                            {id: 'access', label: 'Access', widgets: ['details-effective']},
                            {
                                id: 'matrix',
                                label: 'Record Access',
                                widgets: ['details-matrix'],
                            },
                        ],
                    },
                },

                browser: {
                    title: 'Roles',
                    icon: 'pi pi-key',
                },
            };
        },
);
