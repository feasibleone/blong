import codec from 'ut-codec-payshield';
import tcpPort from 'ut-port-tcp';

import log from '../log.js';

export default layer => class extends tcpPort(layer) {
    get defaults() {
        return {
            format: {
                codec,
                maskedKeys: Object.keys(log.transform)
            },
            log
        };
    }
};
