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

/** The members a JWK uses for private material — what must never reach an introspection answer. */
const PRIVATE_JWK_MEMBERS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'k', 'oth'];

/**
 * The configuration snapshot with private key material removed.
 *
 * `/api/sys/config` exists to show what a process was configured with, and the gateway's pair is part
 * of that — but the pair the loader resolves carries the private half, and a reader of this endpoint
 * must not receive a key that mints the tokens the gateway verifies. Only values that *are* JWKs are
 * touched: an object with `kty` loses its private members, and everything else, including a property
 * merely named `d`, is served as it is. This endpoint is dev-intent only, and that guardrail stands
 * on its own: `systemDebug` must never be enabled in production (D-448).
 */
export const publicConfigSnapshot = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(publicConfigSnapshot);
    if (!value || typeof value !== 'object') return value;
    const entries = Object.entries(value as Record<string, unknown>);
    const isJwk = typeof (value as {kty?: unknown}).kty === 'string';
    const kept = isJwk
        ? entries.filter(([name]) => !PRIVATE_JWK_MEMBERS.includes(name))
        : entries;
    return Object.fromEntries(kept.map(([name, member]) => [name, publicConfigSnapshot(member)]));
};

// The api object is captured by reference so that configRuntime — which is set
// on it after infra items are constructed (load.ts) — is visible at request time.
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

    #apiRef: IApiRef;

    public constructor(config: IConfig, apiRef: IApiRef) {
        super({log: apiRef.log});
        this.merge(this.#config, config);
        this.#apiRef = apiRef;
    }

    public async init(): Promise<void> {
        if (!this.#config.enabled || !this.#apiRef.gateway) return;

        this.log?.warn?.(
            'systemDebug is enabled — introspection endpoints are active; do not enable in production',
        );

        const apiRef = this.#apiRef;
        const prefix = this.#config.routePrefix;
        const authConfig = this.#config.auth;

        const plugin = fp(
            async (server: FastifyInstance) => {
                // GET /api/sys/config — effective runtime configuration snapshot, with the private
                // halves of any key pair removed: the resolved pair is configuration, and a reader of
                // this endpoint must not be handed a key that signs what the gateway verifies.
                server.route({
                    method: 'GET',
                    url: `${prefix}/config`,
                    config: {auth: authConfig},
                    handler: async () =>
                        publicConfigSnapshot(apiRef.configRuntime?.rawSnapshot ?? {}),
                });

                // GET /api/sys/ports — registered adapter/orchestrator port definitions
                server.route({
                    method: 'GET',
                    url: `${prefix}/ports`,
                    config: {auth: authConfig},
                    handler: async () => ({
                        ports: Array.from(apiRef.registry?.ports.keys() ?? []),
                    }),
                });

                // GET /api/sys/methods — registered handler method groups with handler counts
                server.route({
                    method: 'GET',
                    url: `${prefix}/methods`,
                    config: {auth: authConfig},
                    handler: async () => ({
                        methods: Array.from(apiRef.registry?.methods.entries() ?? []).map(
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
                        modules: Array.from(apiRef.registry?.modules.keys() ?? []).filter(
                            (k): k is string => typeof k === 'string',
                        ),
                    }),
                });

                // GET /api/sys/rpc — internal RPC server address info
                server.route({
                    method: 'GET',
                    url: `${prefix}/rpc`,
                    config: {auth: authConfig},
                    handler: async () => apiRef.rpcServer?.info() ?? {},
                });
            },
            {name: 'system-debug'},
        );

        apiRef.gateway!.registerPlugin(plugin);
    }
}
