import type {IGateway, IGatewayRoute, ILog, IRegistry, IRemote} from '@feasibleone/blong/types';
import {Internal} from '@feasibleone/blong/types';
import type {FastifyInstance} from 'fastify';
import fp from 'fastify-plugin';

interface IConfig {
    enabled: boolean;
    routePrefix: string;
    auth: false | 'jwt';
    /** Server identity reported during the MCP initialise handshake. */
    name: string;
    version: string;
    /**
     * Method-name patterns to expose as tools. Defaults to the kukum API —
     * widen this to expose other namespaces, or set `['.']` to expose every
     * registered route.
     */
    tools: string[];
    /** Free-text guidance sent to the client during initialise. */
    instructions?: string;
    logLevel?: string;
}

interface IApiRef {
    log?: ILog;
    gateway?: IGateway;
    registry?: IRegistry;
    remote?: IRemote;
}

/**
 * MCP (Model Context Protocol) server for a Blong gateway, served over
 * Streamable HTTP at `routePrefix` (default `/mcp`).
 *
 * Tools are derived from the gateway's own route table, so the MCP surface can
 * never drift from the API: whatever `kukum.*` (or another configured namespace)
 * route is registered becomes a callable tool, and invoking it dispatches
 * through the same `remote` path an HTTP call would use.
 *
 * Off by default — this exposes an API to any MCP client that can reach the
 * gateway, so it must be enabled deliberately (a suite can enable it in its own
 * `dev` config without affecting anyone else). The SDK is imported lazily so the
 * dependency is not loaded on the default path.
 */
export default class Mcp extends Internal {
    #config: IConfig = {
        enabled: false,
        routePrefix: '/mcp',
        auth: false,
        name: 'blong',
        version: '0.0.0',
        tools: ['^kukum\\.'],
    };

    #apiRef: IApiRef;
    /** Sanitised tool name → gateway method name. */
    #tools: Map<string, string> = new Map();

    public constructor(config: IConfig, apiRef: IApiRef) {
        super({log: apiRef.log});
        this.merge(this.#config, config);
        this.#apiRef = apiRef;
    }

    /** MCP tool names must be `[A-Za-z0-9_-]`; the dotted method maps 1:1. */
    static toolName(method: string): string {
        return method.replaceAll('.', '_').replaceAll('/', '_');
    }

    /**
     * Routes to expose as tools.
     *
     * `tools` entries are regular expressions matched against the wired method
     * name, so the default `^kukum\\.` selects the whole kukum API. They are used
     * verbatim — anchoring is the caller's choice.
     */
    public routes(): IGatewayRoute[] {
        const patterns = this.#config.tools.map(pattern => new RegExp(pattern));
        return (this.#apiRef.gateway?.describe?.() ?? []).filter(
            route => route.method && patterns.some(pattern => pattern.test(route.method)),
        );
    }

    public async init(): Promise<void> {
        if (!this.#config.enabled || !this.#apiRef.gateway) return;

        const remote = this.#apiRef.remote;
        if (!remote) {
            this.log?.warn?.('mcp is enabled but no remote dispatcher is available; skipping');
            return;
        }

        const prefix = this.#config.routePrefix;
        const authConfig = this.#config.auth;
        const logger = this.log;
        const {name, version, instructions, tools: toolPatterns} = this.#config;

        // Deferred into the plugin factory on purpose: fastify runs plugin
        // factories during `gateway.start()`, which is AFTER `registry.start()`
        // has published the validations. Reading `gateway.describe()` in
        // `init()` would see an empty route table.
        const plugin = fp(
            async (instance: FastifyInstance) => {
                const routes = this.routes();
                if (!routes.length) {
                    logger?.warn?.(
                        `mcp is enabled but no routes match ${JSON.stringify(toolPatterns)}`,
                    );
                }

                // Lazy: nothing on the default path should pay for the SDK.
                const {McpServer} = await import('@modelcontextprotocol/sdk/server/mcp.js');
                const {StreamableHTTPServerTransport} =
                    await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
                const {randomUUID} = await import('node:crypto');

                const server = new McpServer({name, version}, {instructions});
                for (const route of routes) {
                    const tool = Mcp.toolName(route.method);
                    this.#tools.set(tool, route.method);
                    server.registerTool(
                        tool,
                        {
                            title: route.method,
                            description:
                                `${route.method} — POST ${route.url}` +
                                (route.auth === false ? ' (no auth required)' : ''),
                        },
                        async (args: unknown) => {
                            const params = (args ?? {}) as Record<string, unknown>;
                            const result = await remote.remote(route.method)(params, {
                                method: route.method,
                            });
                            return {
                                content: [
                                    {type: 'text' as const, text: JSON.stringify(result, null, 2)},
                                ],
                            };
                        },
                    );
                }

                /**
                 * One transport per MCP session, keyed by `Mcp-Session-Id`.
                 *
                 * Sessions are stateful because the protocol requires
                 * `initialize` to precede other methods on the same session: a
                 * stateless per-request server answers every follow-up with
                 * "Method not found".
                 */
                const sessions = new Map<
                    string,
                    InstanceType<typeof StreamableHTTPServerTransport>
                >();

                const sessionFor = async (sessionId?: string) => {
                    const existing = sessionId ? sessions.get(sessionId) : undefined;
                    if (existing) return existing;
                    const transport = new StreamableHTTPServerTransport({
                        sessionIdGenerator: () => randomUUID(),
                        onsessioninitialized: id => {
                            sessions.set(id, transport);
                        },
                        // Plain JSON responses rather than SSE streams: kukum
                        // calls are request/response with no server-initiated
                        // messages, which keeps the endpoint usable from curl and
                        // simple CLI clients.
                        enableJsonResponse: true,
                    });
                    transport.onclose = () => {
                        if (transport.sessionId) sessions.delete(transport.sessionId);
                    };
                    await server.connect(transport);
                    return transport;
                };

                const handle = async (
                    request: Parameters<Parameters<FastifyInstance['route']>[0]['handler']>[0],
                    reply: Parameters<Parameters<FastifyInstance['route']>[0]['handler']>[1],
                ) => {
                    // The transport writes the response itself (including SSE
                    // streams), so hand it the raw Node objects and tell fastify
                    // not to touch the reply.
                    reply.hijack();
                    const sessionId = request.headers['mcp-session-id'] as string | undefined;
                    try {
                        const transport = await sessionFor(sessionId);
                        await transport.handleRequest(request.raw, reply.raw, request.body);
                    } catch (error) {
                        // `reply.hijack()` means fastify will not produce an error
                        // response — without this the client just sees an empty 500.
                        logger?.error?.({error}, 'mcp request failed');
                        if (!reply.raw.headersSent) {
                            reply.raw.writeHead(500, {'content-type': 'application/json'});
                        }
                        reply.raw.end(
                            JSON.stringify({
                                jsonrpc: '2.0',
                                error: {code: -32603, message: (error as Error).message},
                                id: null,
                            }),
                        );
                    }
                };

                instance.route({
                    method: ['GET', 'POST', 'DELETE'],
                    url: prefix,
                    config: {auth: authConfig},
                    handler: handle,
                });
                instance.addHook('onClose', async () => {
                    for (const transport of sessions.values()) await transport.close();
                    sessions.clear();
                });

                logger?.warn?.(
                    `mcp server enabled at ${prefix} — exposing ${routes.length} tool(s); ` +
                        'do not enable in production',
                );
            },
            {name: 'mcp'},
        );

        this.#apiRef.gateway.registerPlugin(plugin);
    }
}
