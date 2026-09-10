import {model} from '@feasibleone/blong';

/**
 * accessAccessModel — browse-only view of the access rules.
 *
 * `accessName` is the display name (lives in `core_resource.resourceName`) and
 * is provided by the custom `access.access.find` handler. No Create/Edit/Delete
 * toolbar — the entity is not editable from the UI.
 */
export default model(
    () =>
        async function accessAccessModel() {
            return {
                subject: 'access',
                object: 'access',
                objectTitle: 'Access',
                public: true,
                nameField: 'access.accessName',

                schema: {
                    properties: {
                        access: {
                            properties: {
                                accessName: {
                                    title: 'Name',
                                    filter: true,
                                    sort: true,
                                },
                                accessType: {
                                    title: 'Type',
                                    filter: true,
                                },
                                isActive: {title: 'Active', type: 'boolean'},
                                // accessRule is a JSON rule configuration.
                                accessRule: {
                                    title: 'Rule',
                                    widget: {type: 'textArea'},
                                },
                                // server schema defined:
                                // accessId: {},
                            },
                            widget: {
                                columns: ['accessName', 'accessType', 'isActive'],
                            },
                        },
                    },
                },

                cards: {
                    browse: {
                        label: 'Access Rules',
                        widgets: ['access'],
                    },
                },

                browser: {
                    title: 'Access Rules',
                    icon: 'pi pi-lock-open',
                    toolbar: [],
                },
            };
        },
);
