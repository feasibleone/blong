import scriptPort from 'ut-port-script';

import log from '../log.js';

export default layer => class extends scriptPort(layer) {
    get defaults() {
        return {
            imports: ['payshield.hsm'],
            namespace: ['hsm'],
            validations: ['payshield.validation'],
            log
        };
    }

    get schema() {
        return {
            type: 'object',
            properties: {
                pciDssMode: {
                    type: 'boolean'
                }
            }
        };
    }

    handlers() {
        return {
            'hsm.service.get': () => layer.utMethod.pkg,
            receive(msg: {type: string}, $meta) {
                if (msg && msg instanceof Error && msg.type) {
                    switch (msg.type) {
                        case 'port.notConnected':
                            throw this.errors.getError('ctp.hsm.notConnected')();
                        case 'port.receiveTimeout':
                        case 'port.timeout':
                        case 'port.disconnectBeforeResponse':
                            throw this.errors.getError('ctp.hsm.timeout')();
                        default:
                            throw msg;
                    }
                }

                return msg;
            }
        };
    }
};
