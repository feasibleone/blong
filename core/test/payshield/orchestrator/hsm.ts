import scriptPort from 'ut-port-script';

import log from '../log.js';

export default (layer: {utMethod: {pkg: unknown}}): unknown =>
    class extends scriptPort(layer) {
        public get defaults(): object {
            return {
                imports: ['payshield.hsm'],
                namespace: ['hsm'],
                validations: ['payshield.validation'],
                log,
            };
        }

        public get schema(): object {
            return {
                type: 'object',
                properties: {
                    pciDssMode: {
                        type: 'boolean',
                    },
                },
            };
        }

        public handlers(): object {
            return {
                'hsm.service.get': () => layer.utMethod.pkg,
                receive(msg: {type: string}) {
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
                },
            };
        }
    };
