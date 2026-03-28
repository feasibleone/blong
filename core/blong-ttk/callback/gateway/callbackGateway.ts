/**
 * Callback gateway - expose webhook endpoints
 */

import {gateway} from '@feasibleone/blong';

export default gateway(blong => ({
    extends: 'gateway.http',
    activation: {
        default: {
            namespace: 'callback',
            port: 5050,
            routes: [
                // Generic callback routes that match Mojaloop patterns
                {
                    method: 'PUT',
                    path: '/transfers/:id',
                    handler: 'handleTransferCallback',
                },
                {
                    method: 'PUT',
                    path: '/quotes/:id',
                    handler: 'handleQuoteCallback',
                },
                {
                    method: 'PUT',
                    path: '/parties/:type/:id',
                    handler: 'handlePartyCallback',
                },
                {
                    method: 'PUT',
                    path: '/transfers/:id/error',
                    handler: 'handleTransferErrorCallback',
                },
                {
                    method: 'PUT',
                    path: '/quotes/:id/error',
                    handler: 'handleQuoteErrorCallback',
                },
            ],
        },
    },
}));
