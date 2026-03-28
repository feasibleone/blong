/**
 * Callback gateway - expose webhook endpoints
 */

import {adapter} from '@feasibleone/blong';

export default adapter(() => ({
    extends: 'adapter.http',
    activation: {
        default: {
            namespace: 'callback',
            port: 5050,
            listen: true,
        },
    },
}));
