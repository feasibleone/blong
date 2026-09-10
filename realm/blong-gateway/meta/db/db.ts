import {handler} from '@feasibleone/blong';

export default handler(() => ({
    config: {
        schema: {
            tables: {
                'gateway.application': 400,
                // A bundle's core_resource has typeAlias `access.role` (a bundle
                // IS a role); the dropdown join restricts entries to real bundles.
                'gateway.bundle': {
                    order: 401,
                    dropdown: {
                        typeAlias: 'access.role',
                        joinTable: 'gateway_bundle',
                        joinColumn: 'bundleId',
                    },
                },
                'gateway.subscription': 402,
            },
        },
    },
}));
