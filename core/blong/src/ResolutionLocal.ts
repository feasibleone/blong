import { internal } from '../types.js';
import type { Resolution } from './Resolution.js';

export default class ResolutionLocal extends internal implements Resolution {
    #config = {
        portRpc: 8091,
        portGateway: 8080,
        domain: 'localhost'
    };

    constructor(config) {
        super();
        this.merge(this.#config, config);
    }

    async resolve(service: string, invalidate: boolean, namespace: string) {
        return {
            hostname: `${service}-service.${this.#config.domain}`,
            port: service.startsWith('rpc-') ? `${this.#config.portRpc}` : `${this.#config.portGateway}`
        };
    }

    announce(service: string, port: number) {}
}
