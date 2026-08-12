import type {IGateway, ILocal, ILog} from '@feasibleone/blong/types';
import {Internal} from '@feasibleone/blong/types';
import type {FastifyInstance, FastifyReply, FastifyRequest} from 'fastify';
import fp from 'fastify-plugin';

interface IConfig {
    /**
     * When false (default) the plugin registers nothing and is a no-op.
     */
    enabled: boolean;
    /**
     * Handler (semantic triple) that performs metering for a request.
     * It must accept `{bundle, creditCost}` and return
     * `{allowed, reason, creditsRemaining, rateLimit, rateCount, rateResetAt}`.
     */
    meterHandler: string;
    /**
     * HTTP status codes for each blocking reason.
     */
    statusCodes: {
        rate: number;
        credits: number;
        subscription: number;
    };
}

interface IGatewayWithPlugins extends IGateway {
    registerPlugin(plugin: unknown, options?: unknown): void;
}

interface IApiRef {
    log?: ILog;
    gateway?: IGatewayWithPlugins;
    local?: ILocal;
}

interface IMeterDecision {
    allowed: boolean;
    reason: 'ok' | 'rate' | 'credits' | 'subscription';
    creditsRemaining?: number;
    rateLimit?: number;
    rateCount?: number;
    rateResetAt?: number;
}

interface IRouteConfig {
    bundle?: string;
    creditCost?: number;
    meter?: boolean;
    methodName?: string;
}

export default class ApiGateway extends Internal {
    #config: IConfig = {
        enabled: false,
        meterHandler: 'gateway.meter.check',
        statusCodes: {
            rate: 429,
            credits: 429,
            subscription: 403,
        },
    };

    #apiRef: IApiRef;

    public constructor(config: IConfig, apiRef: IApiRef) {
        super({log: apiRef.log});
        this.merge(this.#config, config);
        this.#apiRef = apiRef;
    }

    public async init(): Promise<void> {
        if (!this.#config.enabled || !this.#apiRef.gateway) return;

        const config = this.#config;
        const apiRef = this.#apiRef;
        const [subject] = config.meterHandler.split('.');
        const reqName = `ports.${subject}.request`;

        const plugin = fp(
            async (server: FastifyInstance) => {
                // Runs AFTER the jwt plugin (auth + authorize). Metering is the
                // last gate before the route handler — it does NOT authorize.
                server.addHook(
                    'preHandler',
                    async (request: FastifyRequest, reply: FastifyReply) => {
                        const routeConfig = request.routeOptions?.config as
                            | IRouteConfig
                            | undefined;
                        // Opt-in per route: only routes that declare a `bundle`
                        // are metered.  `meter: false` opts a route out.
                        if (!routeConfig || routeConfig.bundle === undefined) return;
                        if (routeConfig.meter === false) return;

                        const handler = apiRef.local?.get(reqName);
                        if (!handler) {
                            request.log.error(
                                {meterHandler: config.meterHandler},
                                'gateway metering handler unavailable',
                            );
                            return reply.code(503).send({error: 'Service Unavailable'});
                        }

                        let result: IMeterDecision;
                        try {
                            const [res] = (await handler.method(
                                {
                                    bundle: routeConfig.bundle,
                                    creditCost: routeConfig.creditCost ?? 0,
                                },
                                {
                                    method: config.meterHandler,
                                    mtid: 'request',
                                    auth: request.auth?.credentials,
                                },
                            )) as [IMeterDecision, unknown];
                            result = res;
                        } catch (error) {
                            // Fail-closed: any metering error (e.g. Redis down)
                            // blocks the request with 503.
                            request.log.error({err: error}, 'gateway metering error');
                            return reply.code(503).send({error: 'Service Unavailable'});
                        }

                        if (result && typeof result === 'object') {
                            if (result.rateLimit !== undefined)
                                reply.header('X-RateLimit-Limit', String(result.rateLimit));
                            if (result.rateLimit !== undefined && result.rateCount !== undefined) {
                                reply.header(
                                    'X-RateLimit-Remaining',
                                    String(Math.max(0, result.rateLimit - result.rateCount)),
                                );
                            }
                            if (result.creditsRemaining !== undefined)
                                reply.header(
                                    'X-Credits-Remaining',
                                    String(result.creditsRemaining),
                                );
                        }

                        if (!result || result.allowed === false) {
                            const reason = result?.reason ?? 'subscription';
                            const status =
                                (config.statusCodes as Record<string, number>)[reason] ?? 429;
                            if (result?.rateResetAt)
                                reply.header(
                                    'Retry-After',
                                    String(
                                        Math.max(
                                            1,
                                            Math.ceil(result.rateResetAt - Date.now() / 1000),
                                        ),
                                    ),
                                );
                            return reply
                                .code(status)
                                .send({error: reason, message: `request ${reason} blocked`});
                        }
                    },
                );
            },
            {name: 'api-gateway'},
        );

        apiRef.gateway!.registerPlugin(plugin);
    }
}
