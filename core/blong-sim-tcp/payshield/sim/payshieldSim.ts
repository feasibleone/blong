import {adapter} from '@feasibleone/blong';
import codec from 'ut-codec-payshield';

import log from '../log.ts';

/**
 * TCP simulation adapter for Payshield HSM.
 *
 * This adapter simulates a Payshield HSM device by listening for TCP connections
 * on the configured port. It uses the same ut-codec-payshield codec for
 * protocol compatibility as the real adapter.
 *
 * The sim layer is auto-activated in integration mode (WELL_KNOWN_LAYERS.sim).
 * Handlers in the payshield.sim group are imported to respond to requests.
 *
 * Key difference from the tcp adapter: listen: true makes this a server.
 */
export default adapter(blong => ({
    extends: 'adapter.tcp',
    activation: {
        default: {
            namespace: ['payshieldsim'],
            imports: ['payshield.payshieldsim'],
            maxReceiveBuffer: 4096,
            format: {
                codec,
                maskedKeys: Object.keys(log.transform),
                headerFormat: '6/string-left-zero',
                messageFormat: {
                    generateKey: {
                        requestPattern: 'mode:1/string, keyType:3/string, keySchemeLmk:1/string',
                    },
                },
            },
            listen: true,
        },
    },
}));
