import {model} from '@feasibleone/blong';

/**
 * accessActionModel — browse-only view of the registered actions.
 *
 * `actionName` is the display name (lives in `core_resource.resourceName`) and
 * is provided by the custom `access.action.find` handler. No Create/Edit/Delete
 * toolbar — the entity is not editable from the UI.
 */
export default model(
    () =>
        async function accessActionModel() {
            return {
                subject: 'access',
                object: 'action',
                objectTitle: 'Action',
                public: true,
                nameField: 'action.actionName',

                schema: {
                    properties: {
                        action: {
                            properties: {
                                actionName: {
                                    title: 'Name',
                                    filter: true,
                                    sort: true,
                                },
                                description: {
                                    title: 'Description',
                                },
                                // server schema defined:
                                // actionId: {},
                            },
                            widget: {
                                columns: ['actionName', 'description'],
                            },
                        },
                    },
                },

                cards: {
                    browse: {
                        label: 'Actions',
                        widgets: ['action'],
                    },
                },

                browser: {
                    title: 'Actions',
                    icon: 'pi pi-bolt',
                    toolbar: [],
                },
            };
        },
);
