import {adapter} from '@feasibleone/blong';
import codec from 'ut-codec-payshield';

import log from '../log.ts';

/**
 * TCP adapter for Payshield HSM communication.
 *
 * Uses the built-in adapter.tcp with the ut-codec-payshield codec for
 * Payshield protocol serialization/deserialization. This replaces the
 * older ut-port-tcp class-extension approach.
 *
 * The codec handles message framing (headerFormat) and payload encoding.
 * Handler imports from the payshield.tcp group are applied on top:
 * - echoRequestSend: prepares idle send echo requests
 * - idleSendEventReceive: handles idle send events
 */
export default adapter(blong => ({
    extends: 'adapter.tcp',
    activation: {
        default: {
            namespace: ['payshieldport'],
            imports: ['payshield.tcp'],
            idleSend: 10000,
            maxReceiveBuffer: 4096,
            format: {
                codec,
                maskedKeys: Object.keys(log.transform),
                headerFormat: '6/string-left-zero',
            },
            listen: false,
        },
    },
}));
