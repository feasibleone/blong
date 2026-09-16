import {model} from '@feasibleone/blong';

/**
 * accessAclModel — the explicit ACL rules (Browse/New/Open).
 *
 * One row grants (`allow`) or refuses (`deny`) one action on one target for one
 * principal — the *explicit* half of the record-level ACL:
 *
 * - **principal** — a user, role, unit or capability.  A rule on a role/unit is
 *   what a user inherits, so the same page administers every level of the
 *   hierarchy.
 * - **action** — the `access_action` resource, i.e. the guarded method.
 * - **target kind** — `scope` (every record linked to that unit/organization
 *   through the table's declared scope edges, descendants included) or `record`
 *   (a single row, typically an exception).
 * - **effect** — `allow`, or `deny`, which always wins over anything an
 *   implicit `hasScope` grant or another rule would allow.
 *
 * The names are joined by `access.acl.find` / `.get` for display; the write
 * handlers drop them again so they never reach the table.
 */
export default model(
    () =>
        async function accessAclModel() {
            return {
                subject: 'access',
                object: 'acl',
                objectTitle: 'ACL Rule',
                public: true,
                nameField: 'acl.targetName',

                schema: {
                    properties: {
                        acl: {
                            properties: {
                                principalId: {
                                    title: 'Principal',
                                    widget: {type: 'dropdown', dropdown: 'access.aclPrincipal'},
                                },
                                actionId: {
                                    title: 'Action',
                                    widget: {type: 'dropdown', dropdown: 'access.action'},
                                },
                                targetKind: {
                                    title: 'Target Kind',
                                    default: 'scope',
                                    filter: true,
                                    widget: {
                                        type: 'select',
                                        options: [
                                            {value: 'scope', label: 'Scope'},
                                            {value: 'record', label: 'Record'},
                                            {value: 'all', label: 'All records'},
                                        ],
                                    },
                                },
                                targetId: {
                                    title: 'Target',
                                    widget: {type: 'dropdown', dropdown: 'access.aclTarget'},
                                },
                                effect: {
                                    title: 'Effect',
                                    default: 'allow',
                                    filter: true,
                                    widget: {
                                        type: 'select',
                                        options: [
                                            {value: 'allow', label: 'Allow'},
                                            {value: 'deny', label: 'Deny'},
                                        ],
                                    },
                                },
                                isActive: {
                                    title: 'Active',
                                    type: 'boolean',
                                    filter: true,
                                    default: true,
                                },
                                // Joined by the custom find/get handlers.
                                principalName: {title: 'Principal', readOnly: true},
                                actionName: {title: 'Action', readOnly: true},
                                targetName: {title: 'Target', readOnly: true},
                            },
                            widget: {
                                columns: [
                                    'principalName',
                                    'actionName',
                                    'effect',
                                    'targetKind',
                                    'targetName',
                                    'isActive',
                                ],
                                hidden: ['principalId', 'actionId', 'targetId'],
                            },
                        },
                    },
                },

                cards: {
                    browse: {
                        label: 'ACL Rules',
                        widgets: ['acl'],
                    },
                    edit: {
                        label: 'ACL Rule',
                        className: 'col-12 md:col-8',
                        widgets: [
                            'acl.principalId',
                            'acl.actionId',
                            'acl.targetKind',
                            'acl.targetId',
                            'acl.effect',
                            'acl.isActive',
                        ],
                    },
                },

                browser: {
                    title: 'ACL Rules',
                    icon: 'pi pi-shield',
                },
            };
        },
);
