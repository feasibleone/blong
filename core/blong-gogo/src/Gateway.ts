import type {
    ApiSchema,
    Errors,
    GatewaySchema,
    ICallLog,
    IErrorFactory,
    IErrorMap,
    IGateway,
    IGatewayRoute,
    ILocal,
    ILog,
    IManifest,
    IMeta,
    IPlatformApi,
} from '@feasibleone/blong/types';
import {Internal, type LevelWithSilent} from '@feasibleone/blong/types';
import fastify, {
    LogController,
    type FastifyInstance,
    type FastifyReply,
    type FastifyRequest,
    type RouteOptions,
} from 'fastify';
import os from 'os';

import {Type, type TSchema} from 'typebox';
import Value from 'typebox/value';
import {v4} from 'uuid';

import {
    deriveStreamKey,
    newStreamSalt,
    resolveKeySpec,
    saltToHeader,
    streamInfoOf,
} from '@feasibleone/blong-mle';
import {TRACE_HEADER, withoutCapabilities} from '@feasibleone/lukaot';
import {exportJWK} from 'jose';
import {CALLS_CAPABILITY, GRANT_HEADER} from './callTrace.ts';
import {GENERATED_KEY_SPEC, GENERATED_PAIR_WARNING} from './gatewayKeys.ts';
import {
    envelopeOf,
    nodeSink,
    plainEncoder,
    sealedEncoder,
    STREAM_BINARY_TYPE,
    STREAM_TEXT_TYPE,
    writeEventStream,
} from './gatewayStream.ts';
import {grantedCalls, grantKeyFrom} from './grant.ts';
import {
    callsFor,
    declareCall,
    enterCapability,
    enterRequestFlow,
    runInFlow,
} from './responseContext.ts';

import {type TypeBoxTypeProvider} from '@fastify/type-provider-typebox';
import type {IResolution} from './Resolution.ts';
import type {IRpcClient} from './RpcClient.ts';
import {caughtError} from './gatewayCaught.ts';
import jwt from './jwt.ts';
import {isExpectedError, methodId, methodParts, snakeToCamel} from './lib.ts';
import type {IConfig as IConfigMLE} from './mle.ts';
import isPublic from './public.ts';
import {registerRawBody} from './rawBody.ts';
import swagger from './swagger.ts';

const osName: string = [os.type(), os.platform(), os.release()].join(':');
const hostName: string = os.hostname();

/** True for the stream a raw-body parser left in `request.body`. */
function isStream(value: unknown): value is NodeJS.ReadableStream {
    return (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as {pipe?: unknown}).pipe === 'function'
    );
}

const typedError: TSchema = Type.Object({
    message: Type.Optional(Type.String()),
    type: Type.Optional(Type.String()),
    print: Type.Optional(Type.String()),
});

const jsonRpcError: TSchema = Type.Object({
    // error
    jsonrpc: Type.Literal('2.0'),
    id: Type.Union([Type.String(), Type.Number()]),
    error: typedError,
});

type GatewayRequest = FastifyRequest;

const errorMap: IErrorMap = {
    'gateway.jwtMissingHeader': {message: 'Missing bearer authorization header', statusCode: 401},
    // The method-level refusal of RBAC.  Typed because a test that probes a denial
    // on purpose declares it in `expect`, and the demotion matches on the type —
    // an untyped `Error` is always logged at error level.
    'gateway.streamNotRequested': {
        message:
            'Method "{method}" answers a stream; ask for one with Accept: text/event-stream ' +
            'or application/vnd.blong.stream',
        statusCode: 406,
    },
    'gateway.streamNoKey': {
        message:
            'Method "{method}" seals its stream and the caller left no key to seal it with: ' +
            'the route must be served to a caller whose encrypt key is known, or opt out with ' +
            'stream: {encrypt: false}',
        statusCode: 500,
    },
    'gateway.streamNotIterable': {
        message:
            'Method "{method}" was asked for a stream and answered {type} instead of an async iterable',
        statusCode: 500,
    },
    'gateway.notAllowed': {
        message: 'Authorization denied: method "{methodName}" not allowed',
        statusCode: 403,
    },
    'gateway.noActions': {
        message: 'Authorization denied: no actions resolved',
        statusCode: 403,
    },
};

declare module 'fastify' {
    interface FastifyContextConfig {
        auth: unknown;
        mle?: unknown;
    }
}

interface IConfig extends IConfigMLE {
    host?: string;
    port?: number;
    logLevel?: LevelWithSilent;
    cors?: unknown;
    debug?: boolean;
    /**
     * When true, the gateway accepts the `expect` field from JSON-RPC request
     * bodies and uses it to suppress error-level log entries for declared
     * expected errors (demoting them to `debug` level).
     *
     * Set to `true` in the `dev` intent.  Must be `false` (the default) in
     * production to prevent callers from suppressing audit-level error logs.
     */
    expectedErrors?: boolean;
    /**
     * Optional handler name (semantic triple) that returns the list of allowed
     * actions for the authenticated user.  When set, the gateway calls this
     * handler during authentication and stores the result in credentials,
     * then enforces that every request's methodId is in the allowed list.
     */
    authorize?: string;
    /**
     * Optional access-check audit.  When set, the gateway records every
     * authorization decision (allow/deny) at the access-check point into the
     * configured handler, plus sanitised DML context for access.* write
     * methods.  `exclude` lists methodId patterns (exact or `prefix*`) that
     * must not be audited.  Best-effort — audit failures never block requests.
     */
    audit?: {
        handler: string;
        exclude?: string[];
    };
    errorFields: unknown[];
    jwt: {
        cache: object;
        audience: string;
    };
    static?: {
        root: string;
    };
}

function operationParams(
    operation: GatewaySchema['operation'],
    bodySchema: ApiSchema | undefined,
    request: GatewayRequest,
): unknown {
    const result: Record<string, unknown> =
        operation?.parameters?.reduce(
            (result: Record<string, unknown>, parameter) => {
                if ('in' in parameter && 'name' in parameter) {
                    let where: Record<string, unknown> | undefined;
                    switch (parameter.in) {
                        case 'header':
                            where = request.headers as Record<string, unknown>;
                            break;
                        case 'query':
                            where = request.query as Record<string, unknown>;
                            break;
                        case 'path':
                            where = request.params as Record<string, unknown>;
                            break;
                        case 'cookie':
                            where = request.cookies as Record<string, unknown>;
                            break;
                        case 'body':
                            if (request.body) {
                                if (parameter.schema?.additionalProperties)
                                    Object.assign(result, request.body);
                                else if (parameter.schema?.properties)
                                    Object.entries(parameter.schema.properties).forEach(
                                        ([name]) => {
                                            if (name in (request.body as Record<string, unknown>))
                                                result[snakeToCamel(name)] = (
                                                    request.body as Record<string, unknown>
                                                )[name];
                                        },
                                    );
                            }
                            break;
                    }
                    if (where && parameter.name in where)
                        result[snakeToCamel(parameter.name)] = where[parameter.name];
                }
                return result;
            },
            {} as Record<string, unknown>,
        ) ?? {};
    if (
        bodySchema &&
        'type' in bodySchema &&
        bodySchema?.type === 'object' &&
        (bodySchema.properties ||
            ('additionalProperties' in bodySchema && bodySchema?.additionalProperties))
    ) {
        if ('additionalProperties' in bodySchema && bodySchema.additionalProperties)
            Object.assign(result, request.body);
        else if (bodySchema.properties)
            Object.entries(bodySchema.properties).forEach(([name]) => {
                if (name in (request.body as Record<string, unknown>))
                    result[snakeToCamel(name)] = (request.body as Record<string, unknown>)[name];
            });
    }
    return result;
}

export default class Gateway extends Internal implements IGateway {
    #server: ReturnType<typeof fastify> | null = null;
    #resolution: IResolution;
    #log: ILog;
    #logger: ReturnType<ILog['child']> | undefined;
    /** The gateway's own call channel: the framework's record of the calls it makes. */
    #calls: ICallLog | undefined;
    #config: IConfig = {
        host: '0.0.0.0',
        port: 8080,
        logLevel: 'warn',
        cors: undefined,
        sign: undefined as IConfig['sign'] | undefined,
        encrypt: undefined as IConfig['encrypt'] | undefined,
        public: {
            sign: undefined,
            encrypt: undefined,
        },
        debug: false,
        expectedErrors: false,
        authorize: undefined,
        audit: undefined,
        errorFields: [],
        jwt: {
            cache: {},
            audience: 'blong',
        },
    };

    #errors: Errors<typeof errorMap>;
    #rpcClient: IRpcClient;
    #routes: RouteOptions[] = [];
    #local: ILocal;
    /** This gateway's private encrypt JWK, resolved once for sealing streams. */
    #streamPrivate: Record<string, unknown> | undefined;

    /**
     * The registered routes as plain data.
     *
     * Derived from the same list that is handed to fastify, so callers (for
     * example the MCP server) see exactly the surface that is served — including
     * the per-route auth requirement, which is not inferable from the method name.
     */
    public describe(): IGatewayRoute[] {
        return this.#routes.map(route => {
            const config = route.config as {methodName?: string; auth?: unknown} | undefined;
            return {
                method: config?.methodName ?? '',
                url: route.url,
                httpMethod: String(route.method ?? 'POST'),
                auth: config?.auth ?? 'jwt',
            };
        });
    }

    /**
     * The browser build this process was configured to serve, as the merge resolved it.
     *
     * `config()` is protected on purpose: that subtree carries the key pair (`sign`, `encrypt`), the
     * exposure D-448 keeps shut. *Which* static root arrived is a different question, and one a test
     * could not ask anywhere — the plugin's own behaviour is covered (`static.test.ts`: it serves a
     * bundle and tolerates a missing one), while nothing could see that a process's own block reaches
     * this port at all. That leg is what a suite's `release` block naming the artifact's browser build
     * depends on, and its failure is silent: the plugin is registered only when the config is there,
     * so `/s` answers nothing while every other surface works (T-246).
     */
    public staticRoot(): string | undefined {
        return this.#config.static?.root;
    }
    #errorFields: [string, unknown][] = [];
    #plugins: {plugin: unknown; options: unknown}[] = [];
    #platform: IPlatformApi;
    #manifest: IManifest | undefined;

    public constructor(
        config: IConfig,
        {
            log,
            remote,
            error,
            resolution,
            local,
            platform,
            manifest,
        }: {
            log?: ILog;
            error?: IErrorFactory;
            remote?: IRpcClient;
            local?: ILocal;
            resolution?: IResolution;
            platform?: IPlatformApi;
            manifest?: IManifest;
        },
    ) {
        super({log});
        this.#log = log!;
        this.#platform = platform!;

        this.merge(this.#config, config);
        // A pair reaches this config as ordinary configuration — the deployment's rc file
        // (`gateway.sign` / `gateway.encrypt` under the pod's home), the `dev` block's committed
        // literals, or a `--gateway.sign=…` flag — and a process given none generates its own. That
        // last case is worth a warning rather than silence: two replicas of one suite would then
        // mint tokens the other cannot verify, and the symptom is a rejected session somewhere else,
        // long after the cause. A deployment that mounts the file never sees this line (D-441).
        const generated = !this.#config.sign || !this.#config.encrypt;
        this.#config.sign ||= GENERATED_KEY_SPEC.sign as IConfig['sign'];
        this.#config.encrypt ||= GENERATED_KEY_SPEC.encrypt as IConfig['encrypt'];
        if (generated) {
            // The loader resolves the pair for every process that serves a gateway
            // (`resolveGatewayPair`), so a missing half here means a gateway built *without* one — a
            // component constructed directly by a test. Kept as the last resort it always was, with
            // the same descriptors and the same sentence the loader uses.
            this.#log?.logger('warn', {name: 'gateway'})?.warn?.({}, GENERATED_PAIR_WARNING);
        }
        this.#errorFields = Object.entries({
            type: true,
            message: true,
            print: true,
            validation: true,
            params: true,
            ...(this.#config.debug && {
                stack: true,
                cause: 'error',
            }),
            ...this.#config.errorFields,
        });
        this.#errors = error!.register(errorMap);
        this.#resolution = resolution!;
        this.#rpcClient = remote!;
        this.#local = local!;
        this.#manifest = manifest;
    }

    protected config(): object {
        return Object.freeze({...this.#config});
    }

    public registerPlugin(plugin: unknown, options?: unknown): void {
        this.#plugins.push({plugin, options});
    }

    private _forward(headers: object): Record<string, string> {
        return (
            [
                ['x-request-id'],
                // The framework's own identity header (see `responseContext.ts`). It
                // travels in the body as well, but a request that never reached the
                // route handler — the one the hooks rejected — is only readable from
                // here, and this is what lets it keep the flow it was given. The
                // capabilities decided for the flow travel inside it, in its `cap`
                // field, which the earliest hook has already rewritten.
                ['x-semantic-trace'],
                ['x-b3-traceid', () => v4().replace(/-/g, '')],
                ['x-b3-spanid'],
                ['x-b3-parentspanid'],
                ['x-b3-sampled'],
                ['x-b3-flags'],
                ['x-ot-span-context'],
                ['x-ut-stack'],
            ] as [string, (() => string)?][]
        ).reduce(function (object: Record<string, string>, [key, value]) {
            if (typeof key === 'string' && key in (headers as Record<string, unknown>))
                object[key] = (headers as Record<string, unknown>)[key] as string;
            else if (value) object[key] = value();
            return object;
        }, {});
    }

    /**
     * Answer a `stream` route: one server-sent event per value the handler yields
     * (`@@D-948`).
     *
     * The response is taken over here (`hijack`) because the frames leave as they
     * are produced rather than as a body fastify serializes — which also means
     * nothing below can answer with a status: the failure of a producer is one
     * `error` event, written by the writer beside the frames that already left.
     *
     * The subscription runs inside the flow this request minted, so everything the
     * handler does for as long as somebody is reading joins that one execution —
     * and the flow closes when the stream does, which is why the write loop is
     * awaited rather than handed to the reply.
     */
    private async _serveStream(
        request: GatewayRequest,
        reply: FastifyReply,
        meta: IMeta,
        method: (params: unknown, $meta: IMeta) => Promise<unknown>,
        params: unknown,
        methodName: string,
        spec: boolean | {encrypt?: boolean; heartbeatMs?: number} | undefined,
    ): Promise<void> {
        // What the caller asked to read, and whether this route may send it
        // unsealed. Both are decided before the response is taken over: a refusal
        // is still an ordinary reply, and a stream that started and then refused
        // would leave the reader with frames it cannot open.
        const envelope = envelopeOf(request.headers.accept);
        if (!envelope) {
            throw this.#errors['gateway.streamNotRequested']({params: {method: methodName}});
        }
        const seal = typeof spec === 'object' ? spec.encrypt !== false : spec !== false;
        const info = streamInfoOf(methodName);
        const salt = seal ? newStreamSalt() : undefined;
        const key = salt ? await this._streamKey(request, salt, info) : undefined;
        if (seal && !key) {
            // A route that seals cannot fall back to plain frames: a reader
            // asking for the stream would receive what the route exists to
            // protect. The refusal names the missing half.
            throw this.#errors['gateway.streamNoKey']({params: {method: methodName}});
        }
        const controller = new AbortController();
        reply.hijack();
        const raw = reply.raw;
        raw.writeHead(200, {
            'content-type':
                envelope === 'binary'
                    ? `${STREAM_BINARY_TYPE}`
                    : `${STREAM_TEXT_TYPE}; charset=utf-8`,
            // A cached stream is a stream that stops: no store, no transform
            // (which would gzip the frames into a buffer nobody reads), and the
            // one header an nginx ingress reads to stop holding responses back
            // while it fills its own.
            'cache-control': 'no-cache, no-transform',
            connection: 'keep-alive',
            // nginx's own spelling, which is why the word is not in the dictionary.
            'x-accel-buffering': 'no',
            ...(salt && {'x-blong-stream-salt': saltToHeader(salt)}),
        });
        raw.flushHeaders?.();
        const abort = (): void => controller.abort();
        // The reader leaving is the *response* closing. A request's own `close`
        // fires as soon as its body has been read — before the first frame of a
        // POST — so listening there would abort every stream at once.
        raw.once('close', abort);
        try {
            await runInFlow(meta, methodName, () =>
                writeEventStream({
                    sink: nodeSink(raw),
                    signal: controller.signal,
                    heartbeatMs: typeof spec === 'object' ? spec.heartbeatMs : undefined,
                    // A binary reader has no comment frame to skip harmlessly, so
                    // the keepalive belongs to the readable envelope alone.
                    heartbeat: envelope === 'text',
                    encoder:
                        key === undefined
                            ? plainEncoder(envelope)
                            : sealedEncoder(envelope, key, info),
                    iterate: this._streamFrames(method, params, meta, controller.signal),
                }),
            );
        } finally {
            raw.off('close', abort);
        }
    }

    /**
     * The key this stream's frames are sealed with, or `undefined` when the caller
     * left nothing to agree on.
     *
     * The pair is the one MLE already uses for responses: the client's public
     * encrypt key (in the token or the JWE header) and this gateway's own private
     * one. Nothing new is exchanged, and the salt makes the result a key for *this*
     * stream only (`@@D-949`).
     */
    private async _streamKey(
        request: GatewayRequest,
        salt: Uint8Array,
        info: string,
    ): Promise<CryptoKey | undefined> {
        const credentials = request.auth?.credentials as {mlek?: unknown} | undefined;
        const peer = credentials?.mlek ?? (request as {mleKeys?: {mlek?: unknown}}).mleKeys?.mlek;
        if (!peer) return undefined;
        const agreed = (
            request as {
                streamKey?: (parameters: {
                    peerPublicJwk: Record<string, unknown>;
                    salt: Uint8Array;
                    info: string;
                }) => Promise<CryptoKey>;
            }
        ).streamKey;
        if (agreed) {
            // The MLE plugin's own crypto: it holds the private encrypt half, and the
            // gateway's config carries only the public JWK (D-441).
            return agreed({peerPublicJwk: peer as Record<string, unknown>, salt, info});
        }
        this.#streamPrivate ||= await this.#resolvePrivateEncryptKey();
        if (!this.#streamPrivate) return undefined;
        const asJwk = async (value: unknown): Promise<Record<string, unknown>> =>
            typeof value === 'object' && value !== null && 'kty' in value
                ? (value as Record<string, unknown>)
                : ((await exportJWK(value as CryptoKey)) as Record<string, unknown>);
        return deriveStreamKey({
            privateJwk: this.#streamPrivate,
            peerPublicJwk: await asJwk(peer),
            salt,
            info,
        });
    }

    /** This gateway's private encrypt JWK, resolved once — a `{generate}` spec must not be re-run. */
    async #resolvePrivateEncryptKey(): Promise<Record<string, unknown> | undefined> {
        const spec = this.#config.encrypt;
        if (!spec) return undefined;
        const resolved = await resolveKeySpec(spec as Parameters<typeof resolveKeySpec>[0]);
        if (!resolved) return undefined;
        const jwk =
            typeof resolved === 'object' && resolved !== null && 'kty' in resolved
                ? (resolved as unknown as Record<string, unknown>)
                : ((await exportJWK(resolved as CryptoKey)) as Record<string, unknown>);
        // Without the private half there is nothing to agree with, and a key that
        // silently appeared public would seal frames nobody can open.
        return 'd' in jwk ? jwk : undefined;
    }

    /**
     * What the handler yields, with the abort it needs.
     *
     * A generator rather than a direct call, so a handler that throws fails where
     * the writer can still report it — inside the stream, instead of after the
     * response was taken over. Only an async iterable counts: a handler that
     * answers an array is answering a value, and a value is not a sequence.
     */
    private async *_streamFrames(
        method: (params: unknown, $meta: IMeta) => Promise<unknown>,
        params: unknown,
        meta: IMeta,
        signal: AbortSignal,
    ): AsyncIterable<unknown> {
        const produced = await method(params, {...meta, abort: signal});
        if (
            produced &&
            typeof (produced as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function'
        ) {
            yield* produced as AsyncIterable<unknown>;
            return;
        }
        throw this.#errors['gateway.streamNotIterable']({
            params: {method: meta.method, type: produced === null ? 'null' : typeof produced},
        });
    }

    private _meta(req: GatewayRequest, version: string, serviceName: string): Partial<IMeta> {
        const {
            'user-agent': frontEnd,
            'geo-position': gps, // https://datatracker.ietf.org/doc/html/draft-daviel-http-geo-header-05
            'x-ut-device': deviceId,
            'x-forwarded-host': forwardedHost,
            'x-forwarded-for': forwardedIp,
        } = req.headers || {};
        const {localAddress, localPort} = req.raw?.socket || {};
        const [latitude, longitude] =
            typeof gps === 'string'
                ? gps.split(' ', 1)[0].split(';')
                : [req.headers.latitude, req.headers.longitude];
        // The token's language is where the session was opened; the browser's
        // active language is what the caller wants *now*, and it changes without a
        // new token. A read answers in the requested language, falling back to the
        // one the token carries — the header wins because it is the more recent
        // statement of intent. `@@D-635`
        const {language: tokenLanguage, ...auth} = req.auth?.credentials || {};
        const requestedLanguage = req.headers['x-blong-language'];
        const language =
            typeof requestedLanguage === 'string' && requestedLanguage
                ? requestedLanguage
                : tokenLanguage;
        return {
            forward: this._forward(req.headers),
            frontEnd,
            latitude,
            longitude,
            deviceId,
            localAddress,
            localPort,
            ...(req.auth?.credentials && {auth}),
            ...(language !== undefined && {language}),
            hostName: (forwardedHost || req.hostname) as string,
            ipAddress: (
                ([] as string[]).concat(forwardedIp as string | string[])[0] ||
                req.socket.remoteAddress ||
                ''
            ).split(',')[0],
            machineName: hostName,
            os: osName,
            version,
            serviceName,
            httpRequest: {
                url: req.protocol + '://' + req.host + req.url,
                state: req.cookies as Record<string, string>,
                headers: req.headers as Record<string, string | string[]>,
            },
        } as Partial<IMeta>;
    }

    private _applyMeta(response: object, {httpResponse}: {httpResponse?: unknown}): object {
        if (httpResponse) {
            const httpResp = httpResponse as Record<string, unknown>;
            const resp = response as Record<string, (...args: unknown[]) => void>;
            [
                'code',
                'redirect',
                'type',
                'created',
                'etag',
                'location',
                'ttl',
                'temporary',
                'permanent',
                'state',
                'unstate', // todo
                'header',
            ].forEach(method => {
                if (Object.prototype.hasOwnProperty.call(httpResp, method)) {
                    const params = httpResp[method];
                    if (Array.isArray((params as unknown[])?.[0])) {
                        // setting multiple headers and cookies require nested arrays
                        (params as unknown[][]).forEach(param =>
                            resp[method](...([] as unknown[]).concat(param)),
                        );
                    } else {
                        resp[method](...([] as unknown[]).concat(params));
                    }
                }
            });
        }
        return response;
    }

    public route(
        validations: Record<string, GatewaySchema>,
        pkg: {name: string; version: string},
    ): void {
        this.#routes = [];
        Object.entries(validations).forEach(([method, value]) => {
            const reqName = `ports.${value.destination ?? method.split('.', 1)[0]}.request`;
            const pubName = `ports.${value.destination ?? method.split('.', 1)[0]}.publish`;
            const isWildcard = method.endsWith('.*');
            /**
             * What this route says about streaming (`@@D-948` `@@D-949`).
             *
             * Only a *refusal* or an *exception* is declared: a route streams when
             * its handler answers an async iterable and the caller asked for one, so
             * `stream: {encrypt: false}` is how a route whose frames are not secret
             * opts out of sealing, and `stream: false` is how one refuses streaming
             * altogether. Absent means "streamable when asked, sealed".
             */
            const streamRoute = value.stream !== false;
            const sealStream =
                typeof value.stream === 'object' ? value.stream.encrypt !== false : true;
            this.#resolution?.announce(
                method.split('.')[0].replace(/\//g, '-'),
                this.#config.port!,
            );
            this.#routes.push({
                method: 'method' in value ? value.method : 'POST',
                url:
                    'path' in value
                        ? `${value.basePath ?? '/rpc/' + method.split('.', 1)[0]}${value.path}`
                        : `/${value.basePath ?? 'rpc'}/${method.split('.').join('/')}`,
                // A streamed route names its own ceiling; every other route keeps fastify's, which no
                // file crosses (@@D-841).
                ...(value.bodyLimit !== undefined && {bodyLimit: value.bodyLimit}),
                config: {
                    auth: value.auth ?? 'jwt',
                    methodName: method,
                    // The route's own request for a stream body, which is what mounts it in the
                    // encapsulated context that holds the parser (@@D-860).
                    ...(value.rawBody && {rawBody: true}),
                    ...(value.bundle !== undefined && {bundle: value.bundle}),
                    ...(streamRoute && {
                        stream: true,
                        ...(sealStream ? {} : {streamSealed: false}),
                    }),
                    ...(value.creditCost !== undefined && {creditCost: value.creditCost}),
                    ...(value.meter !== undefined && {meter: value.meter}),
                    ...(value.audit !== undefined && {audit: value.audit}),
                    ...(value.skipAuthorize && {skipAuthorize: true}),
                    ...(value.authorizeAs !== undefined && {authorizeAs: value.authorizeAs}),
                },
                schema: Type && {
                    ...('body' in value
                        ? {body: value.body}
                        : 'params' in value
                          ? {
                                body: Type.Object({
                                    jsonrpc: Type.Literal('2.0'),
                                    id: Type.Optional(Type.Union([Type.String(), Type.Number()])),
                                    method: isWildcard ? Type.String() : Type.Literal(method),
                                    params: value.params,
                                    // A caller may declare the errors it expects.  The
                                    // gateway only *honours* it when configured to
                                    // (`expectedErrors`), but the field has to survive
                                    // validation for the body to reach the route at all —
                                    // without it the declaration was silently dropped and
                                    // every expected failure was logged as a surprise.
                                    expect: Type.Optional(
                                        Type.Union([Type.String(), Type.Array(Type.String())]),
                                    ),
                                }),
                            }
                          : undefined),
                    // The schema stays declared even for a route that can stream:
                    // a streamed answer takes the response over and is never
                    // validated, while the MLE codec's `serializeInput` needs the
                    // compiled serializer for every ordinary answer — dropping it
                    // for "possible streams" answered every encrypted call with
                    // "Missing serialization function. Key 2xx" (`@@F-786`).
                    ...('response' in value && value.response
                        ? {response: {'2xx': value.response}}
                        : 'result' in value
                          ? {
                                response:
                                    (this.#config.sign || this.#config.encrypt) &&
                                    (value.auth ?? 'jwt')
                                        ? {
                                              '2xx': value.result,
                                              '3xx': typedError,
                                              '4xx': typedError,
                                              '5xx': typedError,
                                          }
                                        : {
                                              '2xx': Type.Union([
                                                  Type.Object({
                                                      // response
                                                      jsonrpc: Type.Literal('2.0'),
                                                      id: Type.Union([
                                                          Type.String(),
                                                          Type.Number(),
                                                      ]),
                                                      result: value.result,
                                                      progress: Type.Optional(
                                                          Type.Array(Type.Any()),
                                                      ),
                                                  }),
                                                  Type.Object({
                                                      // notification
                                                      jsonrpc: Type.Literal('2.0'),
                                                      result: Type.Boolean(),
                                                  }),
                                              ]),
                                              '3xx': jsonRpcError,
                                              '4xx': jsonRpcError,
                                              '5xx': jsonRpcError,
                                          },
                            }
                          : undefined),
                    security: [
                        value.auth === false
                            ? {}
                            : {
                                  'blong-login': ['api'],
                              },
                    ],
                    tags: [method.split('.')[0] + ' ' + pkg.name + '@' + pkg.version],
                },
                // onError: async(request, reply, error) => {
                //     const {id} = 'params' in value ? request.body as {id: string} : {id: 1};
                //     return {
                //         jsonrpc: '2.0',
                //         id,
                //         error: this.formatError(error)
                //     };
                // },
                handler: async (request: GatewayRequest, reply) => {
                    /** This route asked for its body as a stream (`@@D-860`). */
                    const rawBodyRoute = (value as {rawBody?: boolean}).rawBody === true;
                    const {id, params, timeout, expect} =
                        'params' in value
                            ? (request.body as {
                                  id: string;
                                  params: unknown;
                                  timeout: number;
                                  expect: string | string[];
                              })
                            : {
                                  id: 1,
                                  params: operationParams(
                                      value.operation,
                                      'body' in value ? value.body?.schema : undefined,
                                      request,
                                  ),
                                  timeout: false,
                                  expect: undefined,
                              };
                    // Only honour `expect` from the request body when the gateway
                    // is configured to allow it.  This prevents external callers
                    // from suppressing error-level logs in production.
                    const resolvedExpect =
                        this.#config.expectedErrors && expect
                            ? ([] as string[]).concat(expect)
                            : undefined;
                    const methodName = isWildcard
                        ? new URL(request.url, 'http://localhost').pathname
                              .slice(5)
                              .split('/')
                              .join('.')
                        : method;
                    try {
                        const meta = {
                            mtid: !id ? 'notification' : 'request',
                            method: methodName,
                            opcode: methodName.split('.').pop(),
                            ...(timeout && {
                                timeout: this.#platform.timing.after(timeout as number),
                            }),
                            ...(resolvedExpect && {expect: resolvedExpect}),
                            ...this._meta(request, pkg?.version, methodName.split('.')[0]),
                        };
                        const notfound = (): unknown =>
                            reply
                                .code(404)
                                .type('text/plain')
                                .send('namespace not found for method ' + methodName);
                        if (isWildcard && !validations[methodParts(methodName)]) {
                            return reply
                                .code(404)
                                .type('text/plain')
                                .send('validation not found for method ' + methodName);
                        }

                        if (streamRoute && envelopeOf(request.headers.accept)) {
                            const req = this.#local.get(reqName);
                            if (!req) return notfound();
                            return this._serveStream(
                                request,
                                reply,
                                meta as IMeta,
                                req.method.bind(req),
                                params,
                                methodName,
                                value.stream,
                            );
                        }

                        if (!('result' in value)) {
                            const req = this.#local.get(reqName);
                            if (!req) return notfound();
                            // A raw route is answered from the stream the parser left in
                            // `request.body`; no schema reads it, so it is handed to the handler
                            // beside the parameters. The route asked for it, and the encapsulated
                            // mount is what made the parser reach it (@@D-841 @@D-860).
                            if (rawBodyRoute && isStream(request.body)) {
                                (params as Record<string, unknown>).body = request.body;
                            }
                            // The outermost entry mints the flow: everything this
                            // request does downstream joins it, and the method it
                            // was addressed to is the flow's kind.
                            const [result, resultMeta] =
                                (await runInFlow(meta as IMeta, methodName, () =>
                                    req.method(params, meta),
                                )) ?? null;
                            this._applyMeta(reply, resultMeta as {httpResponse?: unknown});
                            return result;
                        } else if (id == null) {
                            const pub = this.#local.get(pubName);
                            if (!pub) return notfound();
                            // A notification is an entry of its own, so it starts a
                            // flow rather than joining one nobody sent.
                            runInFlow(meta as IMeta, methodName, () =>
                                pub.method(params, meta),
                            ).catch(() => {});
                            return {
                                jsonrpc: '2.0',
                                result: true,
                            };
                        } else {
                            const req = this.#local.get(reqName);
                            if (!req) return notfound();
                            // The same entry as the branch above, and it is the ordinary
                            // request/response path — which is why it matters most: the
                            // `onRequest` hook enters the flow with `enterWith`, and that
                            // does not reach a handler the router schedules from its own
                            // async resource, so for a while only the *wildcard* branch
                            // ran inside a flow. Every call the handler made was then
                            // declared in no flow at all, which is why no served request
                            // ever produced a leg while tap runs did. `runInFlow` adopts
                            // the identity the hook published when the meta carries one,
                            // so this does not mint a second flow for the same request.
                            const [result, resultMeta] =
                                (await runInFlow(meta as IMeta, methodName, () =>
                                    // Declare the hop this route is making. The caller is
                                    // **`public`** - the surface that answered the request,
                                    // named apart from the namespace it calls. The gateway realm
                                    // is a namespace called `gateway`, so a caller that was also
                                    // called `gateway` drew the public surface and that namespace
                                    // as one participant, and a realm answering a call to its own
                                    // namespace read as a self-call. The API surface is a unit of
                                    // its own - not the process either: one process hosts a whole
                                    // suite, so naming the process here would draw every flow of a
                                    // monolith as the same participant.
                                    // `methodName` is the wire name the request asked for, and it
                                    // is the leg: the caller is declared beside it, so a diagram
                                    // labels the arrow with the method and draws its source from
                                    // the unit. The callee's receipt then carries the same leg,
                                    // which is what makes the drawing a call rather than a
                                    // participation.
                                    declareCall(
                                        'public',
                                        methodName,
                                        () => {
                                            // The caller's own records, written inside the leg it
                                            // just declared: the callee answers with a receipt for
                                            // the same leg, and a call is finished when it answers -
                                            // so the start, the end and the failure all belong here.
                                            // They go through the call channel rather than the level
                                            // logger: a call is either wanted for the whole flow or
                                            // it is not, and a request that records nothing pays for
                                            // no record at all.
                                            const calls = this.#calls;
                                            calls?.start(methodName);
                                            const answered = req.method(params, meta);
                                            if (answered instanceof Promise) {
                                                return Promise.resolve(answered).then(
                                                    value => {
                                                        calls?.end(methodName);
                                                        return value;
                                                    },
                                                    error => {
                                                        calls?.error(methodName, error);
                                                        throw error;
                                                    },
                                                );
                                            }
                                            calls?.end(methodName);
                                            return answered;
                                        },
                                        meta as IMeta,
                                    ),
                                )) ?? null;
                            this._applyMeta(reply, resultMeta as {httpResponse?: unknown});
                            return {
                                jsonrpc: '2.0',
                                id,
                                result,
                                ...((resultMeta as {progress?: unknown[]})?.progress?.length && {
                                    progress: (resultMeta as {progress?: unknown[]}).progress,
                                }),
                            };
                        }
                    } catch (caught) {
                        // A dispatch answers a failure as a packet, and one path rethrows the packet
                        // rather than its first element: the gateway then read an array where it
                        // expected an error, so a refusal that declared 400 answered 500 with an
                        // error object a client could only render as `{}` (`@@F-720`).
                        const error = caughtError(caught);
                        const typedError = error as {
                            statusCode?: number;
                            httpResponse?: unknown;
                            [key: string]: unknown;
                        };
                        if (!typedError.silent) {
                            if (
                                isExpectedError(
                                    typedError.type as string | undefined,
                                    resolvedExpect,
                                )
                            ) {
                                request.log.debug?.(
                                    {err: error, method: methodName},
                                    'gateway expected error',
                                );
                            } else {
                                request.log.error?.(
                                    {err: error, method: methodName},
                                    'gateway handler error',
                                );
                            }
                        }
                        this._applyMeta(
                            reply
                                .header('x-envoy-decorator-operation', methodName)
                                .code(typedError?.statusCode || 500),
                            {httpResponse: typedError.httpResponse},
                        );
                        return {
                            jsonrpc: '2.0',
                            id,
                            error: this._formatError(typedError),
                        };
                    }
                },
            });
        });
    }

    public async start(): Promise<IGateway> {
        const old = this.#server;
        this.#logger = this.#log.child({name: 'gateway'}, {level: this.#config.logLevel});
        // The call channel of *this* component, so its records carry the component the
        // way its level records do (`logger()` binds the name). Taken once, next to
        // the logger it belongs to.
        this.#calls = this.#log.logger(this.#config.logLevel ?? 'info', {name: 'gateway'}).calls;
        try {
            this.#server = fastify({
                loggerInstance: this.#logger,
                forceCloseConnections: true,
                // fastify's own request logging is off, and the framework's records
                // replace it: it writes the whole request at `info` — headers, the
                // `Authorization` bearer among them — and a completion line, which is
                // both more than a reader needs and less than the flow records say.
                // Nothing else depends on those two lines: the request has a flow, the
                // flow has its calls, and both are recorded where they belong.
                //
                // Passed as a `LogController` instance rather than as fastify's own
                // top-level `disableRequestLogging`, which is deprecated and warned
                // about a line per process — one line per package in a CI run — for a
                // flag whose replacement does exactly the same thing.
                logController: new LogController({disableRequestLogging: true}),
                ajv: {
                    customOptions: {
                        allErrors: true,
                        strict: false,
                    },
                },
            }).withTypeProvider<TypeBoxTypeProvider>();

            this.#server.setValidatorCompiler(({schema}: {schema: TSchema}) => {
                return (data: unknown) => {
                    // 1. Runtime validation check
                    if (!Value.Check(schema, data)) {
                        const errors = [...Value.Errors(schema, data)];
                        return {
                            error: new Error(
                                `Validation failed: ${errors.map(e => e.message).join(', ')}`,
                            ),
                        };
                    }

                    // 2. Transform/Decode the validated string into a Date object
                    try {
                        const decoded = Value.Decode(schema, data);
                        return {value: decoded};
                    } catch (error) {
                        return {error};
                    }
                };
            });

            this.#server.setErrorHandler(
                (error: Record<string, unknown>, request: FastifyRequest, reply: FastifyReply) => {
                    // A hook that refuses before the route runs (authentication, RBAC)
                    // never reaches the handler that resolves `expect` for `$meta`, so
                    // the declaration is read from the request body here: the caller
                    // asked for this failure and the error stream is for the ones it did
                    // not ask for.
                    const expected = this.#config.expectedErrors
                        ? (request.body as {expect?: string | string[]} | undefined)?.expect
                        : undefined;
                    if (isExpectedError(error.type as string | undefined, expected)) {
                        request.log.debug?.({err: error}, 'gateway expected error');
                    } else {
                        request.log.error({err: error}, 'gateway unhandled error');
                    }
                    return reply.status((error as {statusCode?: number}).statusCode || 500).send({
                        jsonrpc: '2.0',
                        id: (request.body as {id?: unknown})?.id,
                        error: this._formatError(error),
                    });
                },
            );
            // The entry of a request is its earliest hook, not its route handler: the
            // authentication and metering hooks run in between, and a call they reject
            // has no route to be wrapped by, so its records would name no flow at all
            // (T-105). The identity is published back onto the request headers, which is
            // where the route handler reads it from when it adopts this same flow.
            //
            // Declared with the three-argument callback shape on purpose. Fastify picks the
            // hook's style from its arity, and a plain function of one argument is awaited
            // nowhere: every request then stopped in this hook, which looked for a day like a
            // slow database rather than a signature - the MLE readiness probe timed out at
            // startup and every realm's tap run failed with a different symptom each time.
            //
            // The metadata endpoints and the static assets are not calls: they are the
            // framework's own plumbing (the MLE key endpoint, the API documentation, what a
            // browser fetches), and minting an execution per probe filled the observed kinds
            // with names like `login..well-known.mle` - a deployment's health checks read as
            // traffic in an observation of its business.
            this.#server.addHook(
                'onRequest',
                async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
                    const pathname = new URL(request.url, 'http://localhost').pathname;
                    if (isPublic(pathname) && pathname.includes('/.well-known/')) {
                        return;
                    }
                    // Only what the earliest hook can see: the route handler knows the
                    // real method and re-enters this flow with it, so a path that does
                    // not name one is left unlabelled rather than guessed at.
                    const kind = pathname.startsWith('/rpc/')
                        ? pathname.slice(5).split('/').filter(Boolean).join('.')
                        : '';
                    // A capability decides what this process may cost itself, so an
                    // outside caller does not get to set one: the field is stripped
                    // from the identity it arrived with, and the decision is made here
                    // and published in its place. The rest of the identity is adopted
                    // exactly as it arrived.
                    const identity = withoutCapabilities(
                        request.headers[TRACE_HEADER] as string | undefined,
                    );
                    if (identity.length > 0) {
                        request.headers[TRACE_HEADER] = identity;
                    } else {
                        delete request.headers[TRACE_HEADER];
                    }
                    // The grant, if one arrived, is verified here and now — once per
                    // request, at the earliest point there is — and what travels on is
                    // the capability it decided, not the token.
                    const grantedCallsToRecord = await grantedCalls(
                        request.headers[GRANT_HEADER] as string | undefined,
                        grantKeyFrom(this.#config),
                    );
                    // A grant wins over the configuration; with none, the configuration
                    // answers and the answer is published for the process that serves
                    // the call. Either way the flow is decided here, before the hooks
                    // that may reject the request: a flow the entry point refused to
                    // record is not recorded by the service it reaches.
                    enterCapability(
                        CALLS_CAPABILITY,
                        grantedCallsToRecord || callsFor({forward: request.headers} as IMeta, kind),
                    );
                    Object.assign(request.headers, enterRequestFlow(request.headers, kind));
                },
            );
            await this.#server.register(jwt, {
                cache: this.#config.jwt?.cache,
                verify: (token: string, options: {nonce?: string; audience: string}) =>
                    this.#rpcClient.verify(token, options),
                errors: this.#errors,
                audience: this.#config.jwt.audience,
                authorize: this.#config.authorize,
                audit: this.#config.audit,
                local: this.#local,
                methodId: methodId,
                methodParts: methodParts,
            });
            if (this.#config.static)
                await this.#server.register(
                    (await import('./static.ts')).default,
                    this.#config.static,
                );
            if (this.#config.cors)
                await this.#server.register((await import('./cors.ts')).default, this.#config.cors);
            if (this.#config.sign || this.#config.encrypt) {
                await this.#server.register((await import('./mle.ts')).default, this.#config);
            } else {
                this.#server.route({
                    method: 'GET',
                    url: '/rpc/login/.well-known/mle',
                    config: {auth: false},
                    handler() {
                        return {};
                    },
                });
            }
            await this.#server.register(swagger, {
                version: '',
            });
            for (const {plugin, options} of this.#plugins)
                await this.#server.register(plugin, options);
            /**
             * One mount per route, and the streaming ones get a context of their own.
             *
             * Fastify's content type parsers are encapsulated: a parser added inside a plugin applies
             * to that plugin's routes and to no one else's. A route that asked for a stream body is
             * therefore mounted in a child instance that owns the parser, which is what keeps the rest
             * of the gateway answering `415` for a body it cannot read instead of handing every route
             * a stream it does not expect (@@D-860).
             */
            for (const route of this.#routes) {
                const streaming =
                    (route.config as {rawBody?: boolean} | undefined)?.rawBody === true;
                if (!streaming) {
                    this.#server.route(route);
                    continue;
                }
                await this.#server.register(async (instance: FastifyInstance) => {
                    registerRawBody(instance);
                    instance.route(route);
                });
            }
            this.#routes = [];
        } finally {
            await old?.close();
        }
        await this.#server.listen({
            port: this.#config.port,
            host: this.#config.host,
        });
        // Publish the effective port to the manifest so other platforms
        // (e.g. browser backend adapter) can discover it.
        // The manifest proxy automatically resolves any pending deferred.
        const address = this.#server.server.address();
        if (this.#manifest && address && typeof address === 'object') {
            this.#manifest.gatewayPort = address.port;
        }

        if (!this.#config.port && !['info', 'debug', 'trace'].includes(this.#config.logLevel ?? ''))
            this.#logger?.warn?.(`gateway listening at random port ${address.port}`);
        return this;
    }

    public async stop(): Promise<IGateway> {
        // fastify's close() waits on the socket layer, and keep-alive connections made by a
        // browser backend (or a leftover probe) hold it open indefinitely: the run ends with
        // a tap "timeout!" against a live server long after every test passed, because the
        // process never exits. Close the connections first so shutting down actually
        // shuts down.
        this.#server?.server.closeIdleConnections?.();
        this.#server?.server.closeAllConnections?.();
        await this.#server?.close();
        this.#server = null;
        return this;
    }

    protected async restart(): Promise<void> {
        await this.stop();
        await this.start();
    }

    private _formatError(error: Record<string, unknown>): object {
        return this.#errorFields.reduce(
            (e, [key, value]) => {
                if (value && typeof error[key] !== 'undefined') {
                    switch (value) {
                        case true:
                            e[key] = error[key];
                            break;
                        case 'error':
                            e[key] = this._formatError(error[key] as Record<string, unknown>);
                            break;
                        default:
                            break;
                    }
                }
                return e;
            },
            {} as Record<string, unknown>,
        );
    }
}
