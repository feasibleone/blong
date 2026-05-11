import type {IConfigRuntime, IGateway, ILog, IRegistry} from '@feasibleone/blong/types';
import {Internal} from '@feasibleone/blong/types';
import type {FastifyInstance} from 'fastify';
import fp from 'fastify-plugin';

interface IConfig {
    enabled: boolean;
    routePrefix: string;
    auth: false | 'jwt';
}

interface IGatewayWithPlugins extends IGateway {
    registerPlugin(plugin: unknown, options?: unknown): void;
}

interface IRpcServerWithInfo {
    info(): object;
}

interface IApiRef {
    log?: ILog;
    gateway?: IGatewayWithPlugins;
    registry?: IRegistry;
    rpcServer?: IRpcServerWithInfo;
    configRuntime?: IConfigRuntime;
}

export default class SystemDebug extends Internal {
    #config: IConfig = {
        enabled: false,
        routePrefix: '/api/sys',
        auth: false,
    };

    #gateway: IGatewayWithPlugins;
    #registry: IRegistry;
    #rpcServer: IRpcServerWithInfo | undefined;
    #apiRef: IApiRef;

    public constructor(config: IConfig, apiRef: IApiRef) {
        super({log: apiRef.log});
        this.merge(this.#config, config);
        this.#gateway = apiRef.gateway!;
        this.#registry = apiRef.registry!;
        this.#rpcServer = apiRef.rpcServer;
        // Keep a live reference to the api object so that configRuntime, which is
        // set after infra items are constructed (load.ts), is visible at request time.
        this.#apiRef = apiRef;
    }

    public async init(): Promise<void> {
        if (!this.#config.enabled || !this.#gateway) return;

        this.log?.warn?.(
            'systemDebug is enabled — introspection endpoints are active; do not enable in production',
        );

        const registry = this.#registry;
        const rpcServer = this.#rpcServer;
        const apiRef = this.#apiRef;
        const prefix = this.#config.routePrefix;
        const authConfig = this.#config.auth;

        const plugin = fp(
            async (server: FastifyInstance) => {
                // GET /api/sys/config — effective runtime configuration snapshot
                server.route({
                    method: 'GET',
                    url: `${prefix}/config`,
                    config: {auth: authConfig},
                    handler: async () => apiRef.configRuntime?.rawSnapshot ?? {},
                });

                // GET /api/sys/ports — registered adapter/orchestrator port definitions
                server.route({
                    method: 'GET',
                    url: `${prefix}/ports`,
                    config: {auth: authConfig},
                    handler: async () => ({
                        ports: Array.from(registry.ports.keys()),
                    }),
                });

                // GET /api/sys/methods — registered handler method groups with handler counts
                server.route({
                    method: 'GET',
                    url: `${prefix}/methods`,
                    config: {auth: authConfig},
                    handler: async () => ({
                        methods: Array.from(registry.methods.entries()).map(
                            ([name, handlers]) => ({
                                name,
                                handlerCount: handlers.length,
                            }),
                        ),
                    }),
                });

                // GET /api/sys/modules — registered realm modules.
                // Symbol keys (used internally for system-tagged infrastructure items)
                // are excluded because they are not JSON-serialisable.
                server.route({
                    method: 'GET',
                    url: `${prefix}/modules`,
                    config: {auth: authConfig},
                    handler: async () => ({
                        modules: Array.from(registry.modules.keys()).filter(
                            (k): k is string => typeof k === 'string',
                        ),
                    }),
                });

                // GET /api/sys/rpc — internal RPC server address info
                server.route({
                    method: 'GET',
                    url: `${prefix}/rpc`,
                    config: {auth: authConfig},
                    handler: async () => rpcServer?.info() ?? {},
                });
            },
            {name: 'system-debug'},
        );

        this.#gateway.registerPlugin(plugin);
    }
}
