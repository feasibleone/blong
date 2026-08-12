import {model} from '@feasibleone/blong';

/**
 * OAuth application management model (browser).
 *
 * The clientId is the `core_resource.resourceName`; the entity columns below
 * drive the auto-generated Browse/New/Open pages for `gateway.application`.
 */
export default model(
    () =>
        async function gatewayApplicationModel() {
            return {
                subject: 'gateway',
                object: 'application',
                objectTitle: 'Application',

                schema: {
                    properties: {
                        application: {
                            properties: {
                                ownerUserId: {title: 'Owner'},
                                applicationType: {
                                    title: 'Type',
                                    widget: {
                                        options: [{value: 'oauth2_client', label: 'OAuth2 Client'}],
                                    },
                                },
                                description: {title: 'Description'},
                                isActive: {title: 'Active'},
                            },
                            widget: {
                                columns: ['applicationType', 'description', 'isActive'],
                            },
                        },
                    },
                },

                cards: {
                    browse: {
                        label: 'Applications',
                        widgets: ['application'],
                    },
                    edit: {
                        label: 'Application Details',
                        widgets: [
                            'application.applicationType',
                            'application.description',
                            'application.isActive',
                        ],
                    },
                    detail: {
                        label: '',
                        readOnly: true,
                        watch: '$.selected.application',
                        widgets: [
                            '$.edit.application.applicationType',
                            '$.edit.application.description',
                            '$.edit.application.isActive',
                        ],
                    },
                },
            };
        },
);
