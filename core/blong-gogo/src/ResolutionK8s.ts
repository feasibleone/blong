import {Internal, type IManifest} from '@feasibleone/blong/types';

import type {IResolution} from './Resolution.ts';

interface IConfig {
    /** The port `RpcServer` serves an orchestrator namespace on. */
    portRpc: number;
    /** The gateway port (unused for namespace resolution, kept for symmetry). */
    portGateway: number;
    /** The cluster DNS domain the Service suffix is built from. */
    domain: string;
    /** The namespace the suite is deployed into. */
    namespace: string;
}

/**
 * Kubernetes resolution: a service id resolves to the Service of the same name
 * in the suite's namespace, instead of to a local port.
 *
 * `GatewayCodec` asks for `rpc-<namespace>` and `RpcServer` serves namespaces on
 * the RPC port, so the `rpc-` prefix is stripped and the port is the
 * namespace's, not the gateway's. `blong-kustomize` generates one Service per
 * orchestrator namespace with that name, which is what makes the namespace the
 * suite's abstract name for a process (see the PRD and the deployment docs).
 *
 * The namespace comes from config, then from `BLONG_NAMESPACE` /
 * `KUBERNETES_NAMESPACE` — the downward API that pins a pod to its own
 * namespace — and only then falls back to `default`.
 *
 * Pinned down with `resolution.impl: kubernetes` in the suite's config; the
 * loader then loads this module instead of `ResolutionLocal` (see the
 * `resolution` component in `load.ts`).
 */
export default class ResolutionK8s extends Internal implements IResolution {
    #config: IConfig = {
        portRpc: 8091,
        portGateway: 8080,
        domain: 'svc.cluster.local',
        namespace: '',
    };
    #manifest: IManifest | undefined;

    public constructor(config: IConfig, {manifest}: {manifest?: IManifest} = {}) {
        super();
        this.merge(this.#config, config);
        this.#manifest = manifest;
        if (!this.#config.namespace) {
            const env = (globalThis as {process?: {env?: Record<string, string | undefined>}})
                .process?.env;
            this.#config.namespace = env?.BLONG_NAMESPACE ?? env?.KUBERNETES_NAMESPACE ?? 'default';
        }
    }

    public async resolve(service: string): ReturnType<IResolution['resolve']> {
        const isRpc = service.startsWith('rpc-');
        const name = service.replace(/^rpc-/, '');
        // The manifest port is deliberately NOT preferred here: a random dev port
        // would point at a Service port the cluster does not publish. In the
        // cluster the Service is the address, and its port is the component's.
        return {
            hostname: `${name}.${this.#config.namespace}.${this.#config.domain}`,
            port: `${isRpc ? this.#config.portRpc : this.#config.portGateway}`,
        };
    }

    public announce(): void {}

    public async start(): Promise<void> {}

    public async stop(): Promise<void> {}
}
