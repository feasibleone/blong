import {model} from '@feasibleone/blong';

/**
 * Subscription management model (browser).
 *
 * Links an application to a bundle; `status` drives authorization + metering
 * (active subscriptions grant the bundle's actions and are metered).
 */
export default model(
    () =>
        async function gatewaySubscriptionModel() {
            return {
                subject: 'gateway',
                object: 'subscription',
                objectTitle: 'Subscription',

                schema: {
                    properties: {
                        subscription: {
                            properties: {
                                applicationId: {
                                    title: 'Application',
                                    widget: {dropdown: 'gateway.application'},
                                },
                                bundleId: {
                                    title: 'Bundle',
                                    widget: {dropdown: 'gateway.bundle'},
                                },
                                status: {
                                    widget: {
                                        options: [
                                            {value: 'active', label: 'Active'},
                                            {value: 'suspended', label: 'Suspended'},
                                            {value: 'cancelled', label: 'Cancelled'},
                                        ],
                                    },
                                },
                                startsAt: {title: 'Starts'},
                                endsAt: {title: 'Ends'},
                                createdAt: {title: 'Created'},
                            },
                            widget: {
                                columns: ['status', 'startsAt', 'endsAt'],
                            },
                        },
                    },
                },

                cards: {
                    browse: {
                        label: 'Subscriptions',
                        widgets: ['subscription'],
                    },
                    edit: {
                        label: 'Subscription Details',
                        widgets: [
                            'subscription.applicationId',
                            'subscription.bundleId',
                            'subscription.status',
                            'subscription.startsAt',
                            'subscription.endsAt',
                        ],
                    },
                    detail: {
                        label: '',
                        readOnly: true,
                        watch: '$.selected.subscription',
                        widgets: [
                            '$.edit.subscription.status',
                            '$.edit.subscription.startsAt',
                            '$.edit.subscription.endsAt',
                        ],
                    },
                },
            };
        },
);
