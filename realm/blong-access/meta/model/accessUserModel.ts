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
 * accessUserModel — user management (Browse/New/Open).
 *
 * The `credential` and `role` details are editable sibling arrays on the Open
 * form: `credential` is a real detail table (managed by the custom
 * `access.user.get/add/edit` handlers — the FK points to `core.resource`,
 * not `access.user.userId`), and `role` is a pivot grid over the
 * `access.role` dropdown backed by the `hasRole` graph edges.
 */
export default model(
    () =>
        async function accessUserModel() {
            return {
                subject: 'access',
                object: 'user',
                objectTitle: 'User',
                public: true,
                nameField: 'user.emailAddress',

                schema: {
                    properties: {
                        user: {
                            properties: {
                                emailAddress: {
                                    title: 'Email',
                                    filter: true,
                                    sort: true,
                                },
                                isActive: {
                                    title: 'Active',
                                    default: true,
                                },
                                // server schema defined:
                                // userId: {},
                            },
                            widget: {
                                columns: ['emailAddress', 'isActive'],
                            },
                        },
                        credential: {
                            items: {
                                properties: {
                                    credentialId: {},
                                    credentialType: {
                                        title: 'Type',
                                        widget: {
                                            type: 'select',
                                            options: [
                                                {value: 'password', label: 'Password'},
                                                {value: 'clientSecret', label: 'Client Secret'},
                                                {value: 'google', label: 'Google'},
                                            ],
                                        },
                                    },
                                    isActive: {title: 'Active', type: 'boolean'},
                                    expiresAt: {
                                        title: 'Expires',
                                        widget: {type: 'dateTime'},
                                    },
                                    // credentialHash/credentialSalt/credentialParamsJSON
                                    // are intentionally not exposed in the UI.
                                },
                            },
                            widget: {
                                columns: ['credentialType', 'isActive', 'expiresAt'],
                            },
                        },
                        role: {
                            items: {
                                properties: {
                                    roleId: {},
                                    roleName: {
                                        title: 'Role',
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
                                    dropdown: 'access.role',
                                    join: {value: 'roleId', label: 'roleName'},
                                },
                                columns: ['roleName', 'granted'],
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

                details: [{object: 'credential'}, {object: 'role'}],

                cards: {
                    browse: {
                        label: 'Users',
                        widgets: ['user'],
                    },
                    edit: {
                        label: 'User Details',
                        className: 'col-12 md:col-8',
                        widgets: ['user.emailAddress', 'user.isActive'],
                    },
                    'details-effective': {label: 'Access', widgets: ['effective']},
                    'details-matrix': {label: 'Record Access', widgets: ['matrix']},
                },

                layouts: {
                    edit: {
                        items: [
                            {id: 'edit', label: 'User', widgets: ['edit']},
                            {
                                id: 'credential',
                                label: 'Credential',
                                widgets: ['details-credential'],
                            },
                            {id: 'role', label: 'Role', widgets: ['details-role']},
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
                    title: 'Users',
                    icon: 'pi pi-users',
                },
            };
        },
);
