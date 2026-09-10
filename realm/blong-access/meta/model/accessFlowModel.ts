import {model} from '@feasibleone/blong';

/**
 * accessFlowModel — browse-only view of the authentication flows.
 *
 * `flowName` is the display name (lives in `core_resource.resourceName`) and
 * is provided by the custom `access.flow.find` handler. No Create/Edit/Delete
 * toolbar — the entity is not editable from the UI.
 */
export default model(
    () =>
        async function accessFlowModel() {
            return {
                subject: 'access',
                object: 'flow',
                objectTitle: 'Flow',
                public: true,
                nameField: 'flow.flowName',

                schema: {
                    properties: {
                        flow: {
                            properties: {
                                flowName: {
                                    title: 'Name',
                                    filter: true,
                                    sort: true,
                                },
                                flowSteps: {
                                    title: 'Steps',
                                    widget: {type: 'textArea'},
                                },
                                isActive: {title: 'Active', type: 'boolean'},
                                // server schema defined:
                                // flowId: {},
                            },
                            widget: {
                                columns: ['flowName', 'flowSteps', 'isActive'],
                            },
                        },
                    },
                },

                cards: {
                    browse: {
                        label: 'Flows',
                        widgets: ['flow'],
                    },
                },

                browser: {
                    title: 'Authentication Flows',
                    icon: 'pi pi-sitemap',
                    toolbar: [],
                },
            };
        },
);
