import {Internal} from '@feasibleone/blong';

import type {IResolution} from './Resolution.js';

interface IConfig {
    portRpc: number;
    portGateway: number;
    domain: string;
}
export default class ResolutionLocal extends Internal implements IResolution {
    #config: IConfig = {
        portRpc: 8091,
        portGateway: 8080,
        domain: 'localhost',
    };

    public constructor(config: IConfig) {
        super();
        this.merge(this.#config, config);
    }

    public async resolve(
        service: string,
        invalidate: boolean,
        namespace: string
    ): ReturnType<IResolution['resolve']> {
        return {
            hostname: `${service}-service.${this.#config.domain}`,
            port: service.startsWith('rpc-')
                ? `${this.#config.portRpc}`
                : `${this.#config.portGateway}`,
        };
    }

    public announce(service: string, port: number): void {}
}
