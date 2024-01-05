import codec from 'ut-codec-payshield';
import tcpPort from 'ut-port-tcp';

import log from '../log.js';

export default (layer: unknown): unknown =>
    class extends tcpPort(layer) {
        public get defaults(): object {
            return {
                format: {
                    codec,
                    maskedKeys: Object.keys(log.transform),
                },
                log,
            };
        }
    };
