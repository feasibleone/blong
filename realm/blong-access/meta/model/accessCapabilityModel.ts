import {model} from '@feasibleone/blong';

/**
 * accessCapabilityModel — capability management (Browse/New/Open).
 *
 * `capabilityName` is the display name (lives in `core_resource.resourceName`)
 * and is provided by the custom `access.capability.find/get/add/edit` handlers.
 *
 * The `action` detail is a pivot grid over the `access.crudEntity` dropdown
 * (distinct entities with standard-CRUD actions): each entity is ONE row with
 * boolean columns for the CRUD verbs. Ticking a cell includes the matching
 * `access<Entity><Predicate>` action in the capability (`hasAction` edges).
 * Actions with non-CRUD predicates appear in the "Other Actions" card inside
 * the same Action tab (read-only list with a `granted` toggle), not in a
 * separate tab.
 */
export default model(
    () =>
        async function accessCapabilityModel() {
            return {
                subject: 'access',
                object: 'capability',
                objectTitle: 'Capability',
                public: true,
                nameField: 'capability.capabilityName',

                schema: {
                    properties: {
                        capability: {
                            properties: {
                                capabilityName: {
                                    title: 'Name',
                                    filter: true,
                                    sort: true,
                                },
                                description: {
                                    title: 'Description',
                                    widget: {type: 'textArea'},
                                },
                                // server schema defined:
                                // capabilityId: {},
                            },
                            widget: {
                                columns: ['capabilityName', 'description'],
                            },
                        },
                        action: {
                            // The CRUD pivot card in the "Action" tab is untitled, so
                            // its table label must be suppressed too (it would duplicate
                            // the tab label).
                            title: '',
                            items: {
                                properties: {
                                    entityName: {
                                        title: 'Entity',
                                        readOnly: true,
                                    },
                                    find: {title: 'Find', type: 'boolean'},
                                    get: {title: 'Get', type: 'boolean'},
                                    add: {title: 'Add', type: 'boolean'},
                                    edit: {title: 'Edit', type: 'boolean'},
                                    remove: {title: 'Remove', type: 'boolean'},
                                },
                            },
                            widget: {
                                type: 'table',
                                keyField: 'entityName',
                                pivot: {
                                    dropdown: 'access.crudEntity',
                                    join: {
                                        value: 'entityName',
                                        label: 'entityName',
                                    },
                                },
                                columns: ['entityName', 'find', 'get', 'add', 'edit', 'remove'],
                            },
                        },
                        otherAction: {
                            items: {
                                properties: {
                                    actionId: {},
                                    actionName: {
                                        title: 'Other Action',
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
                                columns: ['actionName', 'granted'],
                                actions: {
                                    allowAdd: false,
                                    allowEdit: true,
                                    allowDelete: false,
                                },
                            },
                        },
                    },
                },

                details: [{object: 'action'}],

                cards: {
                    browse: {
                        label: 'Capabilities',
                        widgets: ['capability'],
                    },
                    edit: {
                        label: 'Capability Details',
                        className: 'col-12 md:col-8',
                        widgets: ['capability.capabilityName', 'capability.description'],
                    },
                    // The CRUD pivot card inside the "Action" tab — no title because
                    // the tab itself is labelled "Action" (and holds this card plus
                    // the "Other Actions" card below it).
                    'details-action': {
                        label: '',
                    },
                    otherAction: {
                        label: 'Other Actions',
                        widgets: ['otherAction'],
                    },
                },

                // Custom edit layout: the "Action" tab stacks the CRUD pivot card
                // and the "Other Actions" card; everything else keeps the defaults.
                // (An `items` object layout resolves to a tabs layout — no `type`.)
                layouts: {
                    edit: {
                        items: [
                            {id: 'edit', label: 'Capability', widgets: ['edit']},
                            {
                                id: 'action',
                                label: 'Action',
                                widgets: ['details-action', 'otherAction'],
                            },
                        ],
                    },
                },

                browser: {
                    title: 'Capabilities',
                    icon: 'pi pi-lock',
                },
            };
        },
);
