// import type {S3Client} from '@aws-sdk/client-s3';
import type KeycloakAdminClient from '@keycloak/keycloak-admin-client';
// import {
//     AppsV1Api,
//     CoreV1Api,
//     NetworkingV1Api,
//     RbacAuthorizationV1Api,
//     Watch,
// } from '@kubernetes/client-node';
import type {IncomingWebhook} from '@slack/webhook';
import type {MongoClient} from 'mongodb';
import type Assert from 'node:assert';
import {
    Type,
    type Static,
    type TArray,
    type TBoolean,
    type TFunction,
    type TIntersect,
    type TNever,
    type TNumber,
    type TObject,
    type TSchema,
    type TString,
    type TUnknown,
} from 'typebox';
// import type {client} from 'node-vault';
import type {ChokidarOptions, FSWatcherEventMap} from 'chokidar';
import type {EventEmitter} from 'events';
import type {Dirent, StatSyncFn} from 'node:fs';
import type {Duplex} from 'node:stream';
import type {OpenAPI, OpenAPIV2, OpenAPIV3_1} from 'openapi-types';
import type {Level, LogFn, Logger as PinoLogger} from 'pino';
import merge from 'ut-function.merge';
import type {Knex} from './knex.ts';
import type {IMock, IModelSpec} from './model.ts';

// export {
//     AppsV1Api,
//     CoreV1Api,
//     NetworkingV1Api,
//     RbacAuthorizationV1Api,
//     Watch,
// } from '@kubernetes/client-node';
export type * from '@slack/webhook';
export type * from 'bson';
export type * from 'mongodb';
// export type {client} from 'node-vault';
export type {IJsonSchema, OpenAPI, OpenAPIV2, OpenAPIV3, OpenAPIV3_1} from 'openapi-types';
// export type {Level, LogFn, Logger as PinoLogger} from 'pino';
export type {Knex} from './knex.js';
export type * from './model.ts';
export type * from './widget.ts';

export type ServerContext = {
    queryBuilder?: Knex;
    // coreV1Api?: CoreV1Api;
    // appsV1Api?: AppsV1Api;
    // networkingV1Api?: NetworkingV1Api;
    // rbacV1Api?: RbacAuthorizationV1Api;
    // watcher?: Watch;
    kcAdminClient?: KeycloakAdminClient;
    kafkaStream?: Duplex;
    mongodb?: MongoClient;
    // s3?: S3Client;
    slack?: IncomingWebhook;
    // vault?: client;
};

export type BrowserContext = {
    /** TanStack Query client instance (injected by the browser platform). */
    queryClient?: unknown;
    /** React Router navigate function. */
    navigate?: (to: string) => void;
};

export type AdapterContext = ServerContext & BrowserContext;

export interface ILog {
    logger: (level: Level, bindings: object) => ILogger;
    child: PinoLogger['child'];
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A flat map of dotted-path → [prev, next] pairs that represent changed keys */
export type ConfigDiff = Map<string, {prev: unknown; next: unknown}>;

/** Subscriber callback invoked after a successful reload */
export type ConfigSubscriber = (
    diff: ConfigDiff,
    next: object,
    prev: object,
) => void | Promise<void>;

/**
 * Mode used when the config proxy is queried during handler factory initialization.
 *
 * - `'throw'`   — throw immediately (default; keeps misuse from going unnoticed)
 * - `'collect'` — accumulate errors and return them from exitConfigFactoryPhase()
 *                 (useful in tests that explicitly verify the anti-pattern is caught)
 */
export type FactoryPhaseMode = 'throw' | 'collect';
export interface IConfigRuntime {
    /** Current effective config, exposed as a live proxy */
    readonly snapshot: object;
    /** Raw (non-proxy) snapshot of the current effective config */
    readonly rawSnapshot: object;
    /** Load (or reload) config from all sources; returns the updated snapshot */
    load(params?: object): Promise<object>;
    /**
     * Reload config in-place.  The backing store of the proxy is updated so all
     * existing proxy references automatically reflect the new values.
     * Returns the computed diff.
     */
    reload(): Promise<ConfigDiff>;
    /** Compute the diff between two plain config objects without modifying state */
    diff(prev: object, next: object): ConfigDiff;
    /** Register a subscriber to be called after every successful reload */
    subscribe(fn: ConfigSubscriber): () => void;
    /** Enter the config factory phase */
    enterConfig(mode?: FactoryPhaseMode): void;
    /** Exit the config factory phase */
    exitConfig(): Error[];
}

export interface IWatcher extends EventEmitter<FSWatcherEventMap> {
    close(): Promise<void>;
}

export type HRTime = [number, number];

type BaseConfig = {
    name: string;
    pkg: {name: string; version: string};
    children: unknown[];
    url: string;
    base: string;
    server: {
        load: {logLevel: Parameters<ILog['logger']>[0]};
        realm: {logLevel: Parameters<ILog['logger']>[0]};
    };
    browser: {
        load: {logLevel: Parameters<ILog['logger']>[0]};
        realm: {logLevel: Parameters<ILog['logger']>[0]};
    };
    kopi?: {realm?: unknown};
    watch?: {configs?: object};
    configs?: object;
    configNames: string[];
};

export interface IPlatformApi {
    platform: 'server' | 'browser';
    loadConfig: (
        baseConfig: BaseConfig,
        parentConfig: string | object,
        loadedConfigs: object[],
    ) => Promise<{
        loadedConfig: BaseConfig & {
            [key: string]: unknown;
        };
        configRuntime?: IConfigRuntime;
    }>;
    readdir: (path: string) => Promise<Dirent[]>;
    scan: (...path: string[]) => Promise<Dirent[]>;
    existsSync: (path: string) => boolean;
    createRequire?: (path: string | URL) => NodeJS.Require;
    join: (...paths: string[]) => string;
    dirname: (path: string) => string;
    basename: (path: string, ext?: string) => string;
    relative: (from: string, to: string) => string;
    extname: (path: string) => string;
    resolve: (...paths: string[]) => string;
    readFileSync: (path: string, options?: {encoding: BufferEncoding}) => string | Buffer;
    writeFileSync: (
        path: string,
        data: string | Buffer,
        options?: {encoding: BufferEncoding},
    ) => void;
    statSync: StatSyncFn;
    watch?: (path: string | string[], options?: ChokidarOptions) => IWatcher;
    timing: {
        diff: (time: HRTime, newTime: HRTime) => number;
        after: (milliseconds: number) => HRTime;
        now: (previous?: HRTime) => HRTime;
        isAfter: (time: HRTime, timeout: HRTime) => boolean;
        spare: (time: HRTime, latency?: number) => number;
    };
    configs: string[];
    context: Record<string, unknown>;
}

export interface IErrorFactory {
    get(type?: string): Record<string | symbol, {message: string; print?: string} | string>;
    fetch(type: string): object;
    define(
        id: string,
        superType: string | {type: string},
        message: string,
    ): (params?: unknown, $meta?: IMeta) => ITypedError;
    register<T>(errorsMap: T): Record<keyof T, (params?: unknown, $meta?: IMeta) => ITypedError>;
}

export interface IError {
    getError: IErrorFactory['get'];
    fetchErrors: IErrorFactory['fetch'];
    defineError: IErrorFactory['define'];
    register: IErrorFactory['register'];
}

export type Config<T, C> = {
    id: string;
    type: string;
    pkg: {
        name: string;
        version: string;
    };
    format?: {
        sizeAdjust?: number;
    };
    context: C;
    debug: boolean;
    test: boolean;
    disconnectOnError: boolean;
    concurrency: number;
    log: object;
    maxReceiveBuffer: number;
    logLevel: Parameters<ILog['logger']>[0];
    namespace: string | string[];
    imports: string | RegExp | (string | RegExp)[];
    /**
     * Strip this many dot-separated namespace segments from the incoming method
     * name before looking up and calling a local handler.  Useful when the
     * adapter handles a namespace prefix (e.g. `backend`) that must be removed
     * before the real handler name is used.
     *
     * Only applied when the method name does NOT contain a `/` separator
     * (the `/` form is auto-stripped by `methodPath` already).
     */
    stripNamespace?: number;
    /**
     * Prepend this namespace segment (dot-separated) to the outgoing method
     * name when dispatching.  This is the dot-notation counterpart of the
     * existing `destination` field (which uses `/` as separator).
     */
    appendNamespace?: string;
} & T;

export type RemoteMethod = (...params: unknown[]) => Promise<unknown>;
export interface IRemote {
    remote: (methodName: string, options?: object) => RemoteMethod;
    dispatch: (...params: unknown[]) => boolean | Promise<unknown>;
    start: () => Promise<IRemote>;
    stop: () => Promise<IRemote>;
}

export interface IRpcServer {
    register: (methods: object, namespace: string, reply: boolean, pkg: {version: string}) => void;
    unregister: (methods: string[], namespace: string, reply: boolean) => void;
    start: () => Promise<IRpcServer>;
    stop: () => Promise<IRpcServer>;
    setAttachCheckpoint?: (fn: ((meta: IMeta) => void) | undefined) => void;
}

export interface ILocal {
    register: (
        methods:
            | Record<string, (...params: unknown[]) => Promise<unknown>>
            | Array<(...params: unknown[]) => Promise<unknown>>,
        namespace: string,
        reply: boolean,
        pkg: {version: string},
    ) => void;
    unregister: (methods: string[], namespace: string) => void;
    get: (name: string) => {method: (...params: unknown[]) => Promise<unknown[]>};
}

export interface IApiSchema {
    schema(
        def: {namespace?: Record<string, string | string[]> | string[]; url?: string},
        source: string,
    ): Promise<Record<string, GatewaySchema>>;
    generateFile(file: string): Promise<boolean>;
    generateDir(dir: string, files: Dirent[]): Promise<boolean>;
    loadApi(
        locations: string | string[] | object | object[] | {assets: object},
        source: string,
    ): unknown;
}

export interface IObjectSchema {
    [subject: string]: {
        [object: string]: TObject;
    };
}

export interface IGateway {
    route: (
        validations: Record<string, GatewaySchema>,
        pkg: {name: string; version: string},
    ) => void;
    registerPlugin: (plugin: unknown, options?: unknown) => void;
    start: () => Promise<IGateway>;
    stop: () => Promise<IGateway>;
}

export type Handlers = ((params: {
    remote: unknown;
    lib: object;
    port: object | undefined;
    local: object;
    literals: object[];
    gateway: IGateway;
    apiSchema: IApiSchema;
    attachCheckpoint?: (meta: IMeta) => void;
}) => void)[];

export interface IRegistry {
    start: (configOverride: object) => Promise<IRegistry>;
    test: (tester?: unknown) => Promise<void>;
    stop: () => Promise<IRegistry>;
    ports: Map<string, IAdapterRegistry>;
    methods: Map<string, Handlers>;
    modules: Map<string | symbol, IRegistry[]>;
    objectSchema: IObjectSchema;
    createPort: (id: string) => Promise<Adapter | undefined>;
    getPort: (id: string) => Adapter | undefined;
    replaceHandlers: (id: string, handlers: Handlers) => Promise<void>;
    loadApi: (
        id: string,
        def: {
            namespace: Record<string, string | string[]>;
        },
        source: string,
    ) => Promise<void>;
    connected: () => Promise<boolean>;
}

type BlongType = typeof Type & {
    DateTime: () => TSchema;
    Date: () => TSchema;
};

export interface IApi {
    id?: string;
    type: BlongType;
    adapter: (id: string) => IAdapterRegistry | undefined;
    utError: IError;
    errors: IErrorFactory;
    gateway: unknown;
    remote: IRemote;
    rpc: IRpcServer;
    local: ILocal;
    registry: IRegistry;
    schema: IObjectSchema;
    register: (
        methods:
            | Record<string, (...params: unknown[]) => Promise<unknown>>
            | Array<(...params: unknown[]) => Promise<unknown>>,
        namespace: string,
        id: string,
        pkg: {version: string},
    ) => void;
    unregister: (methods: string[], namespace: string) => void;
    subscribe: (
        methods:
            | Record<string, (...params: unknown[]) => Promise<unknown>>
            | Array<(...params: unknown[]) => Promise<unknown>>,
        namespace: string,
        id: string,
        pkg: {version: string},
    ) => void;
    unsubscribe: (methods: string[], namespace: string) => void;
    dispatch: (...params: unknown[]) => boolean | Promise<unknown>;
    methodId: (name: string) => string;
    getPath: (name: string) => string;
    importMethod: (
        methodName: string,
        options?: object,
    ) => (...params: unknown[]) => Promise<unknown>;
    attachHandlers: (
        target: {
            importedMap?: Map<string, object>;
            imported: object;
            config: {namespace?: string | string[]};
        },
        patterns: (string | RegExp)[] | string | RegExp,
        adapter?: boolean,
    ) => unknown;
    createLog: ILog['logger'];
    attachCheckpoint?: (meta: IMeta) => void;
    handlers?: (api: {
        utError: IError;
        remote: IRemote;
        type: BlongType;
        schema: IObjectSchema;
    }) => {
        extends?:
            | string
            | ((api: {
                  utError: IError;
                  remote: IRemote;
                  rpc: IRpcServer;
                  local: ILocal;
                  registry: IRegistry;
                  schema: IObjectSchema;
              }) => object);
    };
    render: (what: object[] | object) => object;
}

export interface IErrorMap {
    [name: string]:
        | string
        | {
              message: string;
              print?: string;
              statusCode?: number;
          };
}

export type Adapter<T = Record<string, unknown>, C = Record<string, unknown>> = IAdapter<T, C> &
    Pick<
        Required<IAdapter<T, C>>,
        | 'init'
        | 'start'
        | 'stop'
        | 'ready'
        | 'config'
        | 'imported'
        | 'errors'
        | 'error'
        | 'findValidation'
        | 'getConversion'
        | 'dispatch'
    >;
export interface IAdapter<T, C> {
    validation?: TSchema;
    config?: Config<T, C>;
    activation?: IActivationConfig<Partial<Config<T, C>>>;
    configBase?: string;
    log?: ILogger;
    errors?: Errors<IErrorMap>;
    imported?: Record<string, PortHandlerBound>;
    importedMap?: Map<string, IRemoteHandler>;
    extends?: object | `adapter.${string}` | `orchestrator.${string}`;
    activeConfig?(this: Adapter<T, C>): Partial<Config<T, C>>;
    init?(this: Adapter<T, C>, ...config: unknown[]): Promise<unknown>;
    start?(this: Adapter<T, C>, ...params: unknown[]): Promise<unknown>;
    ready?(this: Adapter<T, C>): Promise<unknown>;
    stop?(this: Adapter<T, C>, ...params: unknown[]): Promise<unknown>;
    link?(
        this: Adapter<T, C>,
        patterns: (string | RegExp)[] | string | RegExp,
        target: object,
    ): Promise<{
        importedMap?: Map<string, object>;
        imported?: object;
        config?: {namespace?: string | string[]};
    }>;
    connected?(this: Adapter<T, C>): Promise<boolean>;
    error?(error: unknown, $meta: unknown): void;
    pack?(this: Adapter<T, C>, ...params: unknown[]): unknown;
    unpackSize?(this: Adapter<T, C>, ...params: unknown[]): unknown;
    unpack?(this: Adapter<T, C>, ...params: unknown[]): unknown;
    encode?(
        data: unknown,
        $meta: unknown,
        context: unknown,
        log: unknown,
    ): Promise<string | Buffer>;
    decode?(
        buff: string | Buffer,
        $meta: unknown,
        context: unknown,
        log: unknown,
    ): Promise<object[]>;
    request?(...params: unknown[]): Promise<unknown>;
    publish?(): Promise<unknown>;
    drain?(): void;
    findValidation?(this: Adapter<T, C>, $meta: unknown): (...params: unknown[]) => object;
    getConversion?(
        this: Adapter<T, C>,
        $meta: unknown,
        type: string,
    ): {name: string; fn: (...params: unknown[]) => Promise<object>};
    findHandler?(this: Adapter<T, C>, name: string): () => unknown;
    handles?(this: Adapter<T, C>, name: string): boolean;
    forNamespaces?<U>(reducer: (prev: U, current: unknown) => U, initial: U): U;
    methodPath?(name: string): string;
    dispatch?(...params: unknown[]): Promise<unknown>;
    exec?(this: Adapter<T, C>, ...params: unknown[]): Promise<unknown>;
    bytesSent?(count: number): void;
    bytesReceived?(count: number): void;
    msgSent?(count: number): void;
    msgReceived?(count: number): void;
    isConnected?: Promise<boolean>;
    event?(name: string, params?: unknown): Promise<object>;
    handle?(...params: unknown[]): Promise<unknown>;
    connect?(what: unknown, context: unknown): void;
    /**
     * Optional lifecycle hook called when configuration changes.
     * When present, the framework calls this instead of a full stop+start cycle.
     * The adapter should inspect `diff` and only recreate the resources that
     * actually changed (e.g. destroy and rebuild the DB connection pool when
     * the `knex` sub-key is in the diff, but leave everything else intact).
     *
     * @param diff   Flat map of dotted config paths to `{prev, next}` pairs
     * @param next   The full new effective config snapshot (via proxy)
     * @param prev   The full previous effective config snapshot
     */
    configChanged?(
        this: Adapter<T, C>,
        diff: unknown,
        next: unknown,
        prev?: unknown,
    ): Promise<void>;
    /** Allow arbitrary extra methods on adapter definitions (e.g. authenticate) */
    [key: string]: unknown;
}

export interface IAdapterFactory<T = Record<string, unknown>, C = Record<string, unknown>> {
    config?: Config<T, C> | false;
    (api: IApi): IAdapter<T, C>;
}

export interface IAdapterRegistry {
    config: unknown;
    (api: {
        utError: IError;
        remote: IRemote;
        rpc: IRpcServer;
        local: ILocal;
        registry: IRegistry;
        schema: IObjectSchema;
    }): Promise<Adapter>;
}

export interface IMeta {
    mtid?: 'request' | 'response' | 'error' | 'notification' | 'discard' | 'event';
    request?: IMeta;
    stream?: unknown;
    headers?: object;
    trace?: string;
    retry?: number;
    method?: string;
    expect?: string[] | string;
    opcode?: string;
    source?: string;
    forward?: Record<string, string>;
    httpResponse?: {
        type?: string;
        redirect?: string;
        code?: number;
        state?: unknown[];
        header?: string[] | [string, unknown][];
    };
    httpRequest?: {
        url: URL | string;
        state?: object;
        headers: Record<string, string | string[]>;
    };
    auth?: {
        mlek?: object | 'header';
        mlsk?: object | 'header';
        permissionMap?: Buffer;
        actorId?: string | number;
        sessionId?: string;
    };
    language?: {
        languageId?: string | number;
    };
    cache?: {
        port: string;
        optional: boolean;
        instead: boolean;
        before: boolean;
        key: unknown;
        ttl: number;
        after: boolean;
    };
    errorCode?: string;
    errorMessage?: string;
    hostName?: string | string[];
    ipAddress?: string;
    machineName?: string;
    os?: string;
    version?: string;
    serviceName?: string;
    frontEnd?: string;
    localAddress?: string;
    localPort?: number;
    deviceId?: string | string[];
    latitude?: string | string[];
    longitude?: string | string[];
    conId?: string | number;
    dispatch?: (
        msg?: object,
        $meta?: IMeta,
    ) => [msg: object, $meta: IMeta] | boolean | void | Promise<boolean>;
    reply?: unknown;
    timeout?: HRTime;
    timer?: (
        name?: string,
        newTime?: HRTime | undefined,
    ) => {
        [name: string]: number;
    };
    gateway?: object;
    validation?: unknown;
    name?: string;
    checkpoint?: CheckpointFn;
    checkpoints?: Array<{name: string; data?: unknown; timestamp: number}>;
}

export interface IContext {
    // trace: number;
    session?: {
        [name: string]: unknown;
    };
    conId?: string | number;
    requests: Map<
        string,
        {$meta: IMeta; end?: (error: Error) => {local: object; literals: object[]}}
    >;
    waiting: Set<(error: Error) => void>;
    buffer?: Buffer;
}

export interface ITypedError extends Error {
    type: string;
    cause?: Error;
    print?: string;
    method?: string | string[];
    params?: object;
    code?: string;
    req?: {
        httpVersion: string;
        url: URL;
        method: string;
    };
    res?: {
        httpVersion: string;
        statusCode: number;
    };
}

export type Errors<T> = {
    [name in keyof T]: (params?: unknown, $meta?: IMeta) => ITypedError;
};

export interface IBaseConfig extends TObject<{
    watch: TObject<{
        test?: TArray<TString>;
    }>;
    remote: TObject<{
        canSkipSocket?: TBoolean;
    }>;
    adapter: TBoolean | TObject;
    orchestrator: TBoolean | TObject;
    test: TBoolean | TObject;
    error: TBoolean | TObject;
    gateway: TBoolean | TObject;
    sim: TBoolean | TObject;
    resolution: TBoolean | TObject;
    log: TBoolean | TObject;
    apiSchema: TBoolean | TObject;
    registry: TBoolean | TObject;
    port: TBoolean | TObject;
    codec: TBoolean | TObject;
    local: TBoolean | TObject;
    rpcServer: TBoolean | TObject;
    restFs: TBoolean | TObject;
    systemDebug: TBoolean | TObject;
}> {
    additionalProperties: false;
}
export interface IActivationConfig<T> {
    default: T;
    integration?: T;
    deployment?: T;
    microservice?: T;
    dev?: T;
}

export interface IModuleConfig<T extends TSchema = TNever> {
    pkg?: {
        name: string;
        version: string;
    };
    url: string;
    config?: IActivationConfig<Partial<Static<T>> & Partial<Static<IBaseConfig>>>;
    validation?: T;
    children?:
        | (string | (() => Promise<object>))[]
        | ((layer: ModuleApi) => unknown)[]
        | Record<string, () => Promise<unknown>>;
    glob?: Record<string, () => Promise<object>>;
}

export interface ILogger {
    trace?: LogFn;
    debug?: LogFn;
    info?: LogFn;
    warn?: LogFn;
    error?: LogFn;
    fatal?: LogFn;
}

export interface IStep {
    name: string;
    method?: string;
}
export type Sequence = (boolean | string | IStep)[];

export type ApiSchema = TObject | TArray | TBoolean | TString | TNumber | TUnknown | TIntersect;

export type GatewaySchema = (
    | {
          params: ApiSchema;
          result: ApiSchema;
      }
    | {
          body: {
              schema: ApiSchema;
          };
          response: ApiSchema;
      }
    | {
          method: 'GET' | 'POST' | 'PUT' | 'DELETE';
          path?: string;
          response?: ApiSchema;
      }
    | {
          auth: false | 'basic' | 'login';
      }
    | {
          namespace: Record<string, string | string[]>;
      }
) & {
    auth?: false | 'basic' | 'login';
    rpc?: boolean;
    description?: string;
    summary?: string;
    security?: true;
    basePath?: string;
    subject?: string;
    destination?: string;
    operation?: OpenAPIV3_1.OperationObject | OpenAPIV2.OperationObject;
};

export type SchemaObject = OpenAPIV3_1.SchemaObject | OpenAPIV2.SchemaObject;
export type PathItemObject = OpenAPIV3_1.PathItemObject | OpenAPIV2.PathItemObject;
export type ThenableProxy = Promise<unknown> & {[key: string]: ThenableProxy};

/**
 * Augmented assert passed to every chain step.  The `snapshot()` method is
 * injected at runtime by the test executor, so handlers can call it directly
 * without `(assert as any)` casts.  Import this type from `@feasibleone/blong`
 * instead of `typeof Assert` from `node:assert` in test handlers.
 */
export type IAssert = typeof Assert & {
    /**
     * Deferred (no-args): snapshot the step's return value under the step name.
     * Optional object form: `assert.snapshot({mask: ['id']})` adds a per-call mask.
     * Explicit form: `assert.snapshot(value, 'name', {mask?})` writes immediately.
     */
    snapshot(valueOrOpts?: unknown, name?: string, opts?: {mask?: string[]}): void;
    matchSnapshot(value: unknown, name?: string): void;
};

export type ChainStep =
    | ((
          assert: IAssert,
          context: {
              $meta: IMeta;
          } & Record<string, Promise<unknown[]> & ThenableProxy>,
      ) => Promise<object>)
    | object;

export type CheckpointFn = (this: IMeta, name: string, data?: unknown) => void;

export interface ILib {
    type: BlongType;
    error: <T>(errors: T) => Record<keyof T, (params?: unknown, $meta?: IMeta) => ITypedError>;
    rename: <T extends object>(object: T, name: string) => T & {name: string};
    /**
     * Create a named group of chain steps.  The group name is used in test reports.
     * Optionally configure the group with `autoSnapshot: true` to automatically snapshot the
     * return the steps and the common mask to apply to all snapshots taken within the group.
     *
     * @param name
     * @param config
     * @returns
     */
    group: (
        name: string,
        config?: {autoSnapshot?: boolean; mask?: string[]},
    ) => (handlers: ChainStep[]) => ChainStep[] & {name: string};
    /**
     * Create a named snapshot checkpoint marker to place inside a `group()` steps array.
     * Without extra arguments the `'*'` wildcard waits for all pending steps.
     * With step names only those steps are awaited before the context snapshot is taken.
     *
     * @example
     * group('my-test')([
     *   stepA,
     *   stepB,
     *   checkpoint('after-b', 'stepA', 'stepB'),  // wait for A & B, then snapshot
     *   stepC,
     *   checkpoint('final'),                        // wait for all, then snapshot
     * ])
     */
    checkpoint: (name: string, ...markers: string[]) => string[] & {name: string};
    assert: IAssert | undefined;
    yaml: {
        parse: <T>(source: string, options?: unknown) => T;
        parseAllDocuments: <T>(source: string, options?: unknown) => T;
        parseDocument: <T>(source: string, options?: unknown) => T;
        stringify: (value: unknown, options?: unknown) => string;
    };
    ulid: () => string;
    uuid4: () => string;
    uuid7: () => string;
    timing: IPlatformApi['timing'];
    setProperty: (obj: Record<string, unknown>, path: string, value: unknown) => void;
    merge<T, S1>(target: T, source: S1): T & S1;
    merge<T, S1, S2>(target: T, source1: S1, source2: S2): T & S1 & S2;
    merge<T, S1, S2, S3>(target: T, source1: S1, source2: S2, source3: S3): T & S1 & S2 & S3;
    merge<T>(...args: unknown[]): T;
    mergeWithSymbols<T, S1>(target: T, source: S1): T & S1;
    render: (what: object[] | object) => object;
}

export type ValidationFn = () => GatewaySchema;
export interface IValidationProxy<T> {
    type: typeof Type;
    handler: {
        [name: string]: ValidationFn;
    } & IRemoteHandler;
    lib: ILib & {
        [name: string]: TSchema;
    };
    error: {
        [name: string]: (...params: unknown[]) => ITypedError;
    };
    /** Collected object schemas accumulated so far; later `schema()` exports can reference earlier ones. */
    schema: IObjectSchema;
    config: T;
}
export type ValidationDefinition<T> = (
    blong: IValidationProxy<T>,
) => Promise<Record<string, ValidationFn | TSchema> | ValidationFn | ValidationFn[]>;

export type ApiDefinition<T> = (blong: IValidationProxy<T>) =>
    | {
          namespace:
              | string[]
              | Record<
                    string,
                    string | (string | Partial<OpenAPI.Document & {'x-blong-namespace': string}>)[]
                >;
      }
    | {
          url: string;
      };

export type PortHandler<T, C> = <R>(
    this: Adapter<T, C>,
    params: object,
    $meta: IMeta,
    context?: IContext,
) => Promise<R> | R;
export type PortHandlerBound = (<T>(
    params: object,
    $meta: IMeta,
    context?: IContext,
) => Promise<T> | T) & {
    [name: string]: PortHandlerBound;
};
export type LibFn = <T>(...params: unknown[]) => T;
export interface IRemoteHandler {
    [name: string]: PortHandlerBound;
}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ISchema {} // this is being extended via ambient declarations in ~.schema.ts
export interface IHandlerProxy<T> {
    config: T;
    handler: {
        [name: `error${string}`]: (
            message?: string | {params?: object; cause?: Error},
        ) => ITypedError;
    } & ISchema &
        IRemoteHandler;
    lib: ILib & {
        [name: string]: LibFn;
    };
    errors: {
        [name: string]: (...params: unknown[]) => ITypedError;
    };
    /** Collected object schemas from all registered `schema()` exports. */
    schema: IObjectSchema;
    utBus: {
        info: () => {encrypt: object; sign: object};
    };
    gateway: {
        config: () => {public: {sign: object; encrypt: object}};
    };
    apiSchema: IApiSchema;
}

export type ImportProxyCallback<T, C> = (
    blong: IHandlerProxy<T>,
) => PortHandler<T, C> | IAdapterFactory<T, C> | Record<string, PortHandler<T, C>>;
export type Definition<T, C> = object | ImportProxyCallback<T, C> | ImportProxyCallback<T, C>[];

export type LibProxyCallback<T> = (blong: IHandlerProxy<T>) => Record<string, LibFn> | LibFn;
export type Lib<T> = object | LibProxyCallback<T> | LibProxyCallback<T>[];

export type ModuleApi = {
    config: Record<string, unknown>;
    parent: IAdapterFactory;
    error: (errors: object) => ModuleApi;
    validation: <T>(
        method: ValidationDefinition<T> | ValidationDefinition<T>[],
        namespace?: string,
    ) => ModuleApi;
    sequence: (fn: () => Sequence) => ModuleApi;
    feature: (paths: string | string[]) => ModuleApi;
    step: (step: Record<string, () => IStep>) => ModuleApi;
} & {
    [name: string]: (
        blong: Definition<Record<string, unknown>, Record<string, unknown>>,
    ) => ModuleApi;
};

export interface SolutionFactory<T extends TSchema = TNever> {
    (definition: {type: typeof Type}): IModuleConfig<T> | Promise<IModuleConfig<T>>;
}

const Kind: symbol = Symbol.for('blong:kind');
export type Kind = typeof Kind;

export abstract class Internal {
    #log?: ILog | undefined;
    protected log?: ReturnType<ILog['logger']>;
    public constructor(api?: {log?: ILog}) {
        this.#log = api?.log;
    }
    protected merge: ILib['merge'] = (...args: Parameters<ILib['merge']>) => {
        const result = merge<{logLevel?: Level}>(...args);
        if (result.logLevel && this.#log)
            this.log = this.#log.logger(result.logLevel, {name: this.constructor.name});
        return result;
    };
    public async stop(): Promise<unknown> {
        return this;
    }
    public async start(..._args: unknown[]): Promise<unknown> {
        return this;
    }
}

export const handler = <T = Record<string, unknown>, C = AdapterContext>(
    definition: Definition<T, C>,
): Definition<T, C> => Object.defineProperty(definition, Kind, {value: 'handler'});

/**
 * Browser-side equivalent of `handler`.  Use this to define a component handler
 * in a realm's `component/` layer.  Functionally identical to `handler` — the
 * distinction is semantic and makes intent clear in code review.
 *
 * The inner function should return a map whose keys are dot-notation method names
 * (e.g. `'coral.browse'`) and values are async functions that return component
 * metadata `{title, permission, icon, component: async () => ReactComponent}`.
 */
export interface IComponent {
    title?: string;
    permission?: string;
    icon?: string;
    component: (params?: Record<string, unknown>) => Promise<unknown>;
}

export const library = <T = Record<string, unknown>>(definition: Lib<T>): Lib<T> =>
    Object.defineProperty(definition, Kind, {value: 'lib'});
export const validation = <T = Record<string, unknown>>(
    validation: ValidationDefinition<T>,
): ValidationDefinition<T> => Object.defineProperty(validation, Kind, {value: 'validation'});
export const schema = <T = Record<string, unknown>>(
    schema: ValidationDefinition<T>,
): ValidationDefinition<T> => Object.defineProperty(schema, Kind, {value: 'schema'});
export const api = <T = Record<string, unknown>>(api: ApiDefinition<T>): ApiDefinition<T> =>
    Object.defineProperty(api, Kind, {value: 'api'});
export const model = <T extends IModelSpec>(
    definition: () => () => Promise<T>,
): (() => () => Promise<T>) => Object.defineProperty(definition, Kind, {value: 'model'});
export const fixture = <T extends IMock>(definition: () => T): (() => T) =>
    Object.defineProperty(definition, Kind, {value: 'fixture'});

export const validationHandlers: <T>(
    handlers: Record<string, TFunction<[ApiSchema]>>,
) => ValidationDefinition<T> = handlers =>
    validation(async () =>
        Object.fromEntries(
            Object.entries(handlers).map(([name, handler]) => [
                name,
                Object.defineProperty(
                    () => ({
                        params: Type.Parameters(handler).items[0],
                        result: Type.Awaited(Type.ReturnType(handler)),
                        description: 'description' in handler ? handler.description : undefined,
                    }),
                    'name',
                    {value: name},
                ),
            ]),
        ),
    );

export const realm = <T extends TObject>(
    definition: SolutionFactory<T>,
): SolutionFactory<T> & {[Kind]: 'solution'} =>
    Object.defineProperty(definition as SolutionFactory<T> & {[Kind]: 'solution'}, Kind, {
        value: 'solution',
    });
export const server = <T extends TObject>(
    definition: SolutionFactory<T>,
): SolutionFactory<T> & {[Kind]: 'server'} =>
    Object.defineProperty(definition as SolutionFactory<T> & {[Kind]: 'server'}, Kind, {
        value: 'server',
    });
export const browser = <T extends TObject>(
    definition: SolutionFactory<T>,
): SolutionFactory<T> & {[Kind]: 'browser'} =>
    Object.defineProperty(definition as SolutionFactory<T> & {[Kind]: 'browser'}, Kind, {
        value: 'browser',
    });
export const layer = (
    activation: Record<string, boolean | object>,
): Record<string, boolean | object> & {[Kind]: 'layer'} =>
    Object.defineProperty(activation, Kind, {value: 'layer'});
export const adapter = <T, C = AdapterContext>(
    definition: IAdapterFactory<T, C>,
): IAdapterFactory<T, C> & {[Kind]: 'adapter'} =>
    Object.defineProperty(definition as IAdapterFactory<T, C> & {[Kind]: 'adapter'}, Kind, {
        value: 'adapter',
    });
export const orchestrator = <T, C = AdapterContext>(
    definition: IAdapterFactory<T, C>,
): IAdapterFactory<T, C> & {[Kind]: 'orchestrator'} =>
    Object.defineProperty(definition as IAdapterFactory<T, C> & {[Kind]: 'orchestrator'}, Kind, {
        value: 'orchestrator',
    });

export type Kinds =
    | 'lib'
    | 'validation'
    | 'schema'
    | 'api'
    | 'solution'
    | 'server'
    | 'browser'
    | 'adapter'
    | 'orchestrator'
    | 'handler'
    | 'model'
    | 'fixture'
    | '';
export const kind = (what: {[Kind]: Kinds | undefined}): Kinds => what[Kind] || '';

export default {
    handler,
    library,
    validation,
    api,
    realm,
    server,
    browser,
    adapter,
    orchestrator,
    fixture,
    kind,
};
