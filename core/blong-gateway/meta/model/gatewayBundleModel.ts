import {model} from '@feasibleone/blong';

/**
 * API bundle management model (browser).
 *
 * The bundle name is the `core_resource.resourceName` (also the wrapped
 * `access.role` resource name); the columns below (rate/credit metadata) drive
 * the auto-generated pages for `gateway.bundle`.
 */
export default model(
    () =>
        async function gatewayBundleModel() {
            return {
                subject: 'gateway',
                object: 'bundle',
                objectTitle: 'Bundle',

                schema: {
                    properties: {
                        bundle: {
                            properties: {
                                baseMonthlyCredits: {title: 'Monthly Credits'},
                                rateLimit: {title: 'Rate Limit'},
                                rateWindowSec: {title: 'Rate Window (s)'},
                                description: {title: 'Description'},
                                isActive: {title: 'Active'},
                            },
                            widget: {
                                columns: [
                                    'baseMonthlyCredits',
                                    'rateLimit',
                                    'rateWindowSec',
                                    'isActive',
                                ],
                            },
                        },
                    },
                },

                cards: {
                    browse: {
                        label: 'Bundles',
                        widgets: ['bundle'],
                    },
                    edit: {
                        label: 'Bundle Details',
                        widgets: [
                            'bundle.baseMonthlyCredits',
                            'bundle.rateLimit',
                            'bundle.rateWindowSec',
                            'bundle.description',
                            'bundle.isActive',
                        ],
                    },
                    detail: {
                        label: '',
                        readOnly: true,
                        watch: '$.selected.bundle',
                        widgets: [
                            '$.edit.bundle.baseMonthlyCredits',
                            '$.edit.bundle.rateLimit',
                            '$.edit.bundle.rateWindowSec',
                        ],
                    },
                },
            };
        },
);
