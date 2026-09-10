/**
 * Callback realm - Webhook/callback server for async flows
 */

import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: [
        './orchestrator/callbackDispatch',
        './adapter/webhook',
        './gateway/callbackGateway',
    ],
    config: {
        default: {},
        microservice: {
            adapter: true,
            orchestrator: true,
            gateway: true,
        },
    },
}));
