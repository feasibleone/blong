import {model} from '@feasibleone/blong';

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
                },

                browser: {
                    title: 'Users',
                    icon: 'pi pi-users',
                },
            };
        },
);
