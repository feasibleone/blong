/**
 * Webhook server adapter
 * 
 * This adapter creates an HTTP server to receive callbacks.
 * It will be wired to the gateway layer for actual HTTP handling.
 */

import {adapter} from '@feasibleone/blong';

export default adapter(blong => ({
    extends: 'adapter.http',
    activation: {
        default: {
            namespace: 'webhook',
            imports: 'ttk.webhook',
            server: {
                enabled: true,
                port: 5050, // Default webhook port
            },
        },
    },
}));
