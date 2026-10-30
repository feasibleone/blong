import {
    adapter,
    type Adapter,
    type Errors,
    type IErrorMap,
    type IMeta,
} from '@feasibleone/blong/types';
import fastify, {type FastifyInstance, type FastifyReply, type FastifyRequest} from 'fastify';
import got, {type HttpsOptions, type Options} from 'got';
import {Duplex, Readable, Writable} from 'stream';
import {v4} from 'uuid';

import tls from '../../tls.ts';

export interface IConfig {
    tls?: {
        key?: string;
        cert?: string;
        ca?: string | string[];
    };
    handle?: string;
    url?: string;
    /**
     * Start the receiving half.
     *
     * Off by default: a realm may want the posting half alone (a notifier), and a port that listened
     * without being asked would open a socket nothing dials.
     */
    listen?: boolean;
    /** Where the receiving half listens. Port `0` is a real choice — the kernel picks, and the port reports it. */
    server?: {host?: string; port?: number};
    /** The path an incoming request is posted to. */
    path?: string;
    /**
     * The prefix of the receiving hooks: `<hook>.identity`, `<hook>.message`, `<hook>.server`.
     *
     * Defaults to the port's namespace, which is what a port with one handler group wants; a port that
     * receives as one name and sends as another (UT's `slackIn` beside `slack`) names it.
     */
    hook?: string;
    /**
     * How the HTTP answer relates to the work.
     *
     * `server` acknowledges from `response` as soon as the payload is understood and lets the
     * destination run on, which is what a platform with a three-second ack needs; `reply` waits for
     * the chain and answers with what the `server` hook shapes, which is what a test wants to observe.
     */
    mode?: 'server' | 'reply';
    /** The acknowledgement body, when `mode` is `server` or no `server` hook answers. */
    response?: IWebhookResponse;
    /** The method an inbound message is dispatched to, e.g. `chat.in.message.receive`. */
    destination?: string;
    /** Largest body accepted, in bytes. */
    bodyLimit?: number;
}

/** What an incoming request gives the hooks: the parsed body and the bytes it came from. */
export interface IWebhookRequest {
    method: string;
    path: string;
    query: unknown;
    params: unknown;
    headers: Record<string, unknown>;
    /** The body as it arrived, which is what a platform signature is computed over. */
    rawBody?: Buffer;
    /** The same body, parsed — JSON, or a form as a name/value record. */
    body?: unknown;
}

/** What the receiving half answers with. */
export interface IWebhookResponse {
    code?: number;
    body?: unknown;
    headers?: Record<string, string>;
}

/** What the `server` hook is handed, once the chain has run. */
export interface IWebhookAnswerContext {
    request: IWebhookRequest;
    identity?: unknown;
    /** `false` when the payload was understood and there is nothing to process — a challenge, an ack. */
    message?: unknown;
    /** What the destination answered, in `reply` mode only. */
    result?: unknown;
}

/**
 * The three hooks a receiving port may provide.
 *
 * Each is optional and each missing one degrades rather than fails: no identity means no verification
 * (a simulator), no message means the request itself is the message, and no server means the
 * configured response is the answer.
 */
export interface IWebhookHooks {
    identity?: (request: IWebhookRequest, $meta: IMeta) => Promise<unknown>;
    message?: (request: IWebhookRequest, $meta: IMeta) => Promise<unknown>;
    server?: (
        context: IWebhookAnswerContext,
        $meta: IMeta,
    ) => Promise<IWebhookResponse | undefined>;
    /**
     * The acknowledgement, when it depends on the payload rather than on the port.
     *
     * One path often carries two protocols: Slack's Events API and its Interactivity both post to
     * the same Request URL, and the client that posts a form reads a different answer than the
     * server that posts an event — a submitted modal is dismissed by an empty 200 and greeted with
     * an error by any other body (`@@F-645`). The hook runs on the request alone, before the realm,
     * and `undefined` leaves the configured `response` as the answer (`@@D-689`).
     */
    acknowledge?: (request: IWebhookRequest, $meta: IMeta) => Promise<IWebhookResponse | undefined>;
}

/** Everything the answer needs that is not a hook. */
export interface IWebhookBehaviour {
    hook: string;
    mode: 'server' | 'reply';
    response: IWebhookResponse;
    destination?: string;
    /** Reaches the destination — the port's own `dispatch`, or a stub in a test. */
    dispatch?: (message: unknown, $meta: IMeta) => Promise<unknown>;
    /** Mints the trace a request carries, so two deliveries of one event are two traces. */
    traceId?: () => string;
}

/**
 * The ids already delivered, and the cap that keeps the memory bounded.
 *
 * A map rather than a set because the cap evicts the oldest entry, and insertion order is what
 * "oldest" means here. A platform retries on its own schedule, so the only thing a memory has to
 * outlive is one retry window (`@@D-676`).
 */
export interface IWebhookMemory {
    seen: Map<string, true>;
    limit: number;
}

export const webhookMemory = (limit = 1000): IWebhookMemory => ({seen: new Map(), limit});

/**
 * Remember a request id, and answer whether it was already there.
 *
 * `true` means the delivery is a duplicate and must be acknowledged without being processed again.
 * An id-less request is always processed: a platform that names no id gives nothing to compare.
 */
export const webhookRemember = (memory: IWebhookMemory, requestId: string | undefined): boolean => {
    if (!requestId) return false;
    if (memory.seen.has(requestId)) return true;
    memory.seen.set(requestId, true);
    if (memory.seen.size > memory.limit) {
        const oldest = memory.seen.keys().next().value;
        if (oldest !== undefined) memory.seen.delete(oldest);
    }
    return false;
};

const traceOf = (behaviour: IWebhookBehaviour): string =>
    (behaviour.traceId ?? (() => v4().replace(/-/g, '')))();

const metaOf = (request: IWebhookRequest, method: string, behaviour: IWebhookBehaviour): IMeta =>
    ({
        mtid: 'request',
        method,
        forward: {'x-b3-traceid': traceOf(behaviour)},
        params: request.params,
        request,
    }) as unknown as IMeta;

/**
 * Run the receiving chain and produce the HTTP answer.
 *
 * Pure in the sense that matters: every side effect is a hook or the `dispatch` it is handed, so the
 * modes, the duplicate rule and the shapes a `server` hook may return are assertions in
 * `webhook.test.ts` rather than something only a live platform can prove.
 *
 * A `detached` promise is returned in `server` mode rather than awaited: the acknowledgment is the
 * point of that mode, and the caller attaches its own logging so a failure is still recorded.
 */
export const webhookAnswer = async (
    request: IWebhookRequest,
    hooks: IWebhookHooks,
    behaviour: IWebhookBehaviour,
    memory: IWebhookMemory,
): Promise<{response: IWebhookResponse; detached?: Promise<unknown>}> => {
    const identity =
        (await hooks.identity?.(
            request,
            metaOf(request, `${behaviour.hook}.identity`, behaviour),
        )) ?? {};
    // The answer is decided once, before anything runs: it is what a duplicate is answered with
    // too, and a platform whose acknowledgement depends on the payload says so here.
    const ack =
        (await hooks.acknowledge?.(
            request,
            metaOf(request, `${behaviour.hook}.acknowledge`, behaviour),
        )) ?? behaviour.response;
    const requestId = (identity as {requestId?: string}).requestId;
    if (webhookRemember(memory, requestId)) return {response: ack};
    // The identity is `auth` on everything after it, the way a handler reads it: a message hook that
    // builds a download URL, or a destination that records who spoke, needs the account the signature
    // was verified against and not only the fact that it verified.
    const messageMeta = {
        ...metaOf(request, `${behaviour.hook}.message`, behaviour),
        auth: identity,
    };
    const message = (await hooks.message?.(request, messageMeta)) ?? request;
    if (message === false) {
        const shaped = await hooks.server?.(
            {request, identity, message},
            metaOf(request, `${behaviour.hook}.server`, behaviour),
        );
        return {response: shaped ?? ack};
    }
    const destinationMeta = {
        ...messageMeta,
        ...(behaviour.destination && {method: behaviour.destination}),
    };
    if (behaviour.mode === 'server') {
        const detached = behaviour.destination
            ? Promise.resolve(behaviour.dispatch?.(message, destinationMeta))
            : undefined;
        return {response: ack, detached};
    }
    const result = behaviour.destination
        ? await behaviour.dispatch?.(message, destinationMeta)
        : undefined;
    const shaped = await hooks.server?.(
        {request, identity, message, result},
        metaOf(request, `${behaviour.hook}.server`, behaviour),
    );
    return {response: shaped ?? ack};
};

/** The body parser a receiving port installs, keeping the bytes beside the value. */
export const webhookBodyParser =
    (kind: 'json' | 'form') =>
    (
        request: FastifyRequest,
        body: Buffer,
        done: (error: Error | null, value?: unknown) => void,
    ): void => {
        (request as FastifyRequest & {rawBody?: Buffer}).rawBody = body;
        if (!body.length) {
            done(null, null);
            return;
        }
        const text = body.toString('utf8');
        try {
            done(
                null,
                kind === 'json' ? JSON.parse(text) : Object.fromEntries(new URLSearchParams(text)),
            );
        } catch (error) {
            // A body that is not what its content type promised is the caller's mistake, so the answer
            // is a 400 rather than the 500 a bare parser error would produce.
            const failure = new Error(`Cannot parse the ${kind} body`, {cause: error});
            (failure as Error & {statusCode?: number}).statusCode = 400;
            done(failure, undefined);
        }
    };

const errorMap: IErrorMap = {
    'webhook.http': 'HTTP Error',
};

let _errors: Errors<typeof errorMap>;

/** The port as the receiving half needs it: its own hook handlers, and the dispatch to the realm. */
interface IWebhookPort {
    config: IConfig & {namespace?: string | string[]};
    findHandler(name: string): unknown;
    handle(params: unknown, $meta: IMeta): Promise<unknown>;
}

export default adapter<IConfig>(({utError, local, registry}) => {
    _errors ||= utError.register(errorMap);
    let stream: Duplex | null = null;
    let https: HttpsOptions | undefined;
    let http: FastifyInstance | null = null;
    const memory = webhookMemory();

    return {
        activation: {
            default: {
                type: 'webhook',
                url: 'http://localhost:8080',
            },
        },
        async init(...configs: object[]) {
            await super.init(...configs);
            https = tls(this.config, true) as HttpsOptions | undefined;
            const cfg = this.config as unknown as Record<string, unknown>;
            if (cfg['codec.openapi'])
                await registry.loadApi(
                    this.config.id + '.api',
                    cfg['codec.openapi'] as {namespace: Record<string, string | string[]>},
                    this.configBase ?? '',
                );
        },

        async start(this: Adapter<IConfig>) {
            const result = await super.start();
            const readable = new Readable({
                objectMode: true,
                read() {},
            });
            const self = this as unknown as IWebhookPort;
            const cfg = this.config as IConfig & {namespace?: string | string[]};
            const hook =
                cfg.hook ?? (typeof cfg.namespace === 'string' ? cfg.namespace : 'webhook');
            const response: IWebhookResponse = cfg.response ?? {
                code: 200,
                body: 'EVENT_RECEIVED',
            };
            /**
             * Call one of the port's own hooks.
             *
             * `handle` finds the imported handler by name, so a hook the port does not carry is simply
             * absent — which is how a simulator runs the same receiver with nothing verified.
             */
            const call = async (name: string, params: unknown, $meta: IMeta): Promise<unknown> => {
                if (!self.findHandler(name)) return undefined;
                return self.handle(params, $meta);
            };
            const hooks: IWebhookHooks = {
                identity: (request, $meta) => call(`${hook}.identity`, request, $meta),
                // A port with no message hook receives the request itself: it is the shape a simulator
                // wants, and the shape a platform port replaces with a canonical message.
                message: async (request, $meta) =>
                    (await call(`${hook}.message`, request, $meta)) ?? request,
                server: async (context, $meta) =>
                    (await call(`${hook}.server`, context, $meta)) as IWebhookResponse | undefined,
                acknowledge: async (request, $meta) =>
                    (await call(`${hook}.acknowledge`, request, $meta)) as
                        | IWebhookResponse
                        | undefined,
            };

            local.register(
                {
                    [`${this.config.namespace}Webhook.request`]: async (
                        params: unknown,
                        $meta: unknown,
                    ) =>
                        new Promise((resolve, reject) => {
                            ($meta as Record<string, unknown>)['dispatch'] = (
                                ...packet: unknown[]
                            ) => {
                                (this.dispatch as (...args: unknown[]) => Promise<unknown[]>)(
                                    ...packet,
                                ).then(resolve, reject);
                            };
                            readable.push([params, $meta]);
                        }),
                    [`${this.config.namespace}Webhook.publish`]: async (...params: unknown[]) => {
                        readable.push(params);
                    },
                    /**
                     * The address the port bound, which is how a port configured with `port: 0` is
                     * reached: a test and the README both need to know where it listens, and reading it
                     * back is cheaper than agreeing on a number.
                     */
                    [`${this.config.namespace}Webhook.address`]: async () => ({
                        host: cfg.server?.host,
                        port: cfg.server?.port,
                        path: cfg.path,
                        listening: Boolean(http),
                    }),
                },
                'ports',
                false,
                this.config.pkg,
            );

            stream = Duplex.from({
                writable: new Writable({
                    objectMode: true,
                    write: async (
                        [
                            {
                                path = '',
                                query: searchParams,
                                url = new URL(path, cfg.url),
                                responseType = 'json',
                                method,
                                headers,
                                body,
                                form,
                                json,
                            },
                            $meta,
                        ]: [
                            {
                                path: string;
                                query: string;
                                url: URL;
                                responseType: Options['responseType'];
                                method: Options['method'];
                                headers: Options['headers'];
                                body: Options['body'];
                                form: Options['form'];
                                json: Options['json'];
                            },
                            IMeta,
                        ],
                        _encoding: BufferEncoding,
                        callback: (error?: Error | null) => void,
                    ) => {
                        try {
                            const request = {
                                url,
                                searchParams,
                                https,
                                method: method || 'POST',
                                headers,
                                responseType,
                                body,
                                form,
                                json,
                                throwHttpErrors: false,
                                followRedirect: false,
                                // isStream: false,
                            };
                            if (this.log?.trace) this.log.trace(request);
                            else
                                this.log?.info?.(
                                    `${(request.method as string).toUpperCase()} ${url}`,
                                );
                            {
                                const result = await got(request);
                                const {headers, body, statusCode, statusMessage} = result;
                                if (this.log?.trace) this.log.trace({headers, body, statusCode});
                                else
                                    this.log?.info?.(
                                        `${statusCode} ${statusMessage} ${(request.method as string).toUpperCase()} ${url}`,
                                    );
                                if (!$meta.trace)
                                    readable.push([result, {...$meta, mtid: 'response'}]);
                            }
                        } catch (error) {
                            callback(_errors['webhook.http'](error!));
                            return;
                        }
                        callback();
                    },
                }),
                readable,
            });

            super.connect(stream);

            if (cfg.listen) {
                const app = fastify({
                    logger: false,
                    bodyLimit: cfg.bodyLimit ?? 1048576,
                });
                app.addContentTypeParser(
                    'application/json',
                    {parseAs: 'buffer'},
                    webhookBodyParser('json'),
                );
                app.addContentTypeParser(
                    'application/x-www-form-urlencoded',
                    {parseAs: 'buffer'},
                    webhookBodyParser('form'),
                );
                app.route({
                    method: 'POST',
                    // The path is written `<hook>`-style, with a parameter in braces
                    // and a configuration reads back as it was written — while the router
                    // matches `:name`. The translation is here rather than in every port, because a port
                    // that had to write router syntax would make the config the router's copy. The
                    // optional marker travels with the name (`{action?}` → `:action?`).
                    url: (cfg.path ?? '/webhook').replace(/\{([A-Za-z0-9_]+)(\?)?\}/g, ':$1$2'),
                    handler: async (request: FastifyRequest, reply: FastifyReply) => {
                        const descriptor: IWebhookRequest = {
                            method: request.method,
                            path: request.url.split('?')[0] ?? request.url,
                            query: request.query,
                            params: request.params,
                            headers: request.headers as Record<string, unknown>,
                            rawBody: (request as FastifyRequest & {rawBody?: Buffer}).rawBody,
                            body: request.body,
                        };
                        const answer = (shaped: IWebhookResponse) => {
                            const {code = 200, body = null, headers} = shaped;
                            if (headers) reply.headers(headers);
                            return reply.code(code).send(body);
                        };
                        try {
                            const {response: shaped, detached} = await webhookAnswer(
                                descriptor,
                                hooks,
                                {
                                    hook,
                                    mode: cfg.mode ?? 'server',
                                    response,
                                    destination: cfg.destination,
                                    dispatch: (message, $meta) =>
                                        (
                                            this.dispatch as unknown as (
                                                params: unknown,
                                                $meta: IMeta,
                                            ) => Promise<unknown>
                                        )(message, $meta),
                                },
                                memory,
                            );
                            detached?.catch(error => this.log?.warn?.(error));
                            return answer(shaped);
                        } catch (error) {
                            // A handler throws `errors[name]({params}, $meta)`, and with `$meta` the factory
                            // answers an array — the shape the bus unpacks. The status and the type live on
                            // the error inside it, not on the array.
                            const thrown = (Array.isArray(error) ? error[0] : error) as Error & {
                                statusCode?: number;
                                type?: string;
                            };
                            const statusCode = thrown?.statusCode ?? 500;
                            this.log?.warn?.(thrown);
                            return reply.code(statusCode).send({
                                error: {
                                    ...(thrown?.type && {type: thrown.type}),
                                    message: thrown?.message ?? 'Webhook request failed',
                                },
                            });
                        }
                    },
                });
                await app.listen({
                    host: cfg.server?.host ?? '0.0.0.0',
                    port: cfg.server?.port ?? 0,
                });
                const address = app.server.address();
                if (address && typeof address === 'object') {
                    cfg.server = {
                        host: cfg.server?.host ?? address.address,
                        port: address.port,
                    };
                }
                http = app;
            }

            return result;
        },

        async stop(...params: unknown[]) {
            let result;
            try {
                if (http) {
                    const closing = http;
                    http = null;
                    await closing.close();
                }
                if (stream) {
                    const closing = stream;
                    stream = null;
                    // `Duplex.from` reports a bare destroy as a rejected operation — `AbortError` — which
                    // the port loop logs as a stream error on every ordinary shutdown. Ending both halves
                    // first turns the teardown into a close; the destroy then only releases the handle.
                    closing.push(null);
                    closing.end();
                    setImmediate(() => closing.destroy());
                }
            } finally {
                stream = null;
                result = await super.stop(...params);
            }
            return result;
        },
    };
});
