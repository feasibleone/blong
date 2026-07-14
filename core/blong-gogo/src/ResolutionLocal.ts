import {Internal, type IManifest} from '@feasibleone/blong/types';

import type {IResolution} from './Resolution.ts';

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
    #manifest: IManifest | undefined;

    public constructor(config: IConfig, {manifest}: {manifest?: IManifest} = {}) {
        super();
        this.merge(this.#config, config);
        this.#manifest = manifest;
    }

    public async resolve(
        service: string,
        // invalidate: boolean,
        // namespace: string,
    ): ReturnType<IResolution['resolve']> {
        const isRpc = service.startsWith('rpc-');
        // Prefer manifest-published ports over config defaults, so that
        // services listening on random ports (port:0 in dev intent) are
        // discoverable by GatewayCodec / _discoverService.
        // The manifest property may be a plain value or a Deferred/thenable
        // — `await` handles both.
        const manifestPort = this.#manifest
            ? await this.#manifest[isRpc ? 'rpcPort' : 'gatewayPort']
            : undefined;
        return {
            hostname: 'localhost',
            port:
                manifestPort != null
                    ? `${manifestPort}`
                    : isRpc
                      ? `${this.#config.portRpc}`
                      : `${this.#config.portGateway}`,
        };
    }

    public announce(): void {}

    public async start(): Promise<void> {}

    public async stop(): Promise<void> {}
}
