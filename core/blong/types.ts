// import type {S3Client} from '@aws-sdk/client-s3';
import type KeycloakAdminClient from '@keycloak/keycloak-admin-client';
// import {
//     AppsV1Api,
//     CoreV1Api,
//     NetworkingV1Api,
//     RbacAuthorizationV1Api,
//     Watch,
// } from '@kubernetes/client-node';
import {
    Type,
    type JavaScriptTypeBuilder,
    type Static,
    type TArray,
    type TBoolean,
    type TFunction,
    type TObject,
    type TSchema,
    type TString,
} from '@sinclair/typebox';
import type {IncomingWebhook} from '@slack/webhook';
import type {MongoClient} from 'mongodb';
// import type {client} from 'node-vault';
import type {Dirent} from 'node:fs';
import type {Duplex} from 'node:stream';
import type {OpenAPI, OpenAPIV2, OpenAPIV3_1} from 'openapi-types';
import type {Level, LogFn, Logger as PinoLogger} from 'pino';
import merge from 'ut-function.merge';
import type {Knex} from './knex.js';

// export {
//     AppsV1Api,
//     CoreV1Api,
//     NetworkingV1Api,
//     RbacAuthorizationV1Api,
//     Watch,
// } from '@kubernetes/client-node';
export * from '@slack/webhook';
export * from 'mongodb';
// export type {client} from 'node-vault';
export type {IJsonSchema, OpenAPI, OpenAPIV2, OpenAPIV3, OpenAPIV3_1} from 'openapi-types';
// export type {Level, LogFn, Logger as PinoLogger} from 'pino';
export type {Knex} from './knex.js';

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

export type BrowserContext = {};

export type AdapterContext = ServerContext & BrowserContext;

export interface ILog {
    logger: (level: Level, bindings: object) => ILogger;
    child: PinoLogger['child'];
}

export interface IErrorFactory {
    get(type?: string): unknown;
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
    imports: string | string[];
} & T;

export type RemoteMethod = (...params: unknown[]) => Promise<unknown>;
export interface IRemote {
    remote: (methodName, options?) => RemoteMethod;
    dispatch: (...params: unknown[]) => boolean | Promise<unknown>;
    start: () => Promise<void>;
    stop: () => Promise<void>;
}

export interface IRpcServer {
    register: (methods: object, namespace: string, reply: boolean, pkg: {version: string}) => void;
    unregister: (methods: string[], namespace: string, reply: boolean) => void;
    start: () => Promise<void>;
    stop: () => Promise<void>;
}

export interface ILocal {
    register: (methods: object, namespace: string, reply: boolean, pkg: {version: string}) => void;
    unregister: (methods: string[], namespace: string) => void;
    get: (name: string) => {method: (...params: unknown[]) => Promise<unknown[]>};
}

export interface IApiSchema {
    schema(
        def: {namespace: Record<string, string | string[]>},
        source: string,
    ): Promise<Record<string, GatewaySchema>>;
    generateFile(file: string): Promise<boolean>;
    generateDir(dir: string, files: Dirent[]): Promise<boolean>;
}

export interface IGateway {
    route: (
        validations: Record<string, GatewaySchema>,
        pkg: {name: string; version: string},
    ) => void;
    start: () => Promise<void>;
    stop: () => Promise<void>;
}

export type Handlers = ((params: {
    remote: unknown;
    lib: object;
    port: object;
    local: object;
    literals: object[];
    gateway: IGateway;
}) => void)[];

export interface IRegistry {
    start: () => Promise<void>;
    test: (tester?: unknown) => Promise<void>;
    stop: () => Promise<void>;
    ports: Map<string, IAdapterFactory>;
    methods: Map<string, Handlers>;
    modules: Map<string | symbol, IRegistry[]>;
    createPort: (id: string) => Promise<ReturnType<IAdapterFactory>>;
    replaceHandlers: (id: string, handlers: object) => Promise<void>;
    loadApi: (
        id: string,
        def: {
            namespace: Record<string, string | string[]>;
        },
        source?: string,
    ) => Promise<void>;
    connected: () => Promise<boolean>;
}

export interface IApi {
    id?: string;
    adapter: (
        id: string,
    ) => (api: {
        utError: IError;
        remote: IRemote;
        rpc: IRpcServer;
        local: ILocal;
        registry: IRegistry;
    }) => object;
    utError: IError;
    errors: IErrorFactory;
    gateway: unknown;
    remote: IRemote;
    rpc: IRpcServer;
    local: ILocal;
    registry: IRegistry;
    utBus: {
        config: object;
        register: (methods: object, namespace: string, id: string, pkg: {version: string}) => void;
        unregister: (methods: string[], namespace: string) => void;
        subscribe: (methods: object, namespace: string, id: string, pkg: {version: string}) => void;
        unsubscribe: (methods: string[], namespace: string) => void;
        dispatch: (...params: unknown[]) => boolean | Promise<unknown>;
        methodId: (name: string) => string;
        getPath: (name: string) => string;
        importMethod: (methodName, options?) => (...params: unknown[]) => Promise<unknown>;
        attachHandlers: (target: object, patterns: unknown, adapter?: boolean) => unknown;
    };
    utLog: {
        createLog: ILog['logger'];
    };
    handlers?: (api: {utError: IError}) => {
        extends?:
            | string
            | ((api: {
                  utError: IError;
                  remote: IRemote;
                  rpc: IRpcServer;
                  local: ILocal;
                  registry: IRegistry;
              }) => object);
    };
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

export interface IAdapter<T, C> {
    config?: Config<T, C>;
    configBase?: string;
    log?: ILogger;
    errors?: Errors<IErrorMap>;
    imported?: ReturnType<IAdapterFactory<T, C>>;
    extends?: object | `adapter.${string}` | `orchestrator.${string}`;
    init?: (this: ReturnType<IAdapterFactory<T, C>>, ...config: Partial<Config<T, C>>[]) => void;
    start?: (this: ReturnType<IAdapterFactory<T, C>>) => Promise<object>;
    ready?: (this: ReturnType<IAdapterFactory<T, C>>) => Promise<object>;
    stop?: (this: ReturnType<IAdapterFactory<T, C>>) => Promise<object>;
    connected?: (this: ReturnType<IAdapterFactory<T, C>>) => Promise<boolean>;
    error?: (error: Error, $meta: IMeta) => void;
    pack?: (
        this: ReturnType<IAdapterFactory<T, C>>,
        packet: {size: number; data: Buffer},
    ) => Buffer;
    unpackSize?: (
        this: ReturnType<IAdapterFactory<T, C>>,
        buffer: Buffer,
    ) => {size: number; data: Buffer};
    unpack?: (
        this: ReturnType<IAdapterFactory<T, C>>,
        buffer: Buffer,
        options?: {size: number},
    ) => Buffer;
    encode?: (data: unknown, $meta: IMeta, context: object, log: ILogger) => string | Buffer;
    decode?: (buff: string | Buffer, $meta: IMeta, context: object, log: ILogger) => object[];
    request?: () => Promise<unknown>;
    publish?: () => Promise<unknown>;
    drain?: () => void;
    findValidation?: (this: ReturnType<IAdapterFactory<T, C>>, $meta: IMeta) => () => object;
    getConversion?: (
        this: ReturnType<IAdapterFactory<T, C>>,
        $meta: IMeta,
        type: 'send' | 'receive',
    ) => {name: string; fn: () => object};
    findHandler?: (this: ReturnType<IAdapterFactory<T, C>>, name: string) => () => unknown;
    handles?: (this: ReturnType<IAdapterFactory<T, C>>, name: string) => boolean;
    forNamespaces?: <T>(reducer: (prev: T, current: unknown) => T, initial: T) => T;
    methodPath?: (name: string) => string;
    dispatch?: (...params: unknown[]) => Promise<unknown>;
    exec?: (this: ReturnType<IAdapterFactory<T, C>>, ...params: unknown[]) => Promise<unknown>;
    bytesSent?: (count: number) => void;
    bytesReceived?: (count: number) => void;
    msgSent?: (count: number) => void;
    msgReceived?: (count: number) => void;
    isConnected?: Promise<boolean>;
    event?: (name: string, params?: unknown) => Promise<object>;
    handle?: (...params: unknown[]) => Promise<unknown>;
    connect?: (
        what: unknown,
        context: {requests: unknown; waiting: unknown; buffer: unknown},
    ) => void;
}

export interface IAdapterFactory<T = Record<string, unknown>, C = Record<string, unknown>> {
    config?: unknown;
    (api: IApi): IAdapter<T, C>;
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
    forward?: object;
    httpResponse?: {
        type?: string;
        redirect?: string;
        code?: number;
        state?: unknown[];
        header?: string[] | [string, unknown][];
    };
    httpRequest?: {
        url: URL | string;
        state: object;
        headers: object;
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
    conId?: number;
    dispatch?: (
        msg?: object,
        $meta?: IMeta,
    ) => [msg: object, $meta: IMeta] | boolean | void | Promise<boolean>;
    reply?: unknown;
    timeout?: number;
    timer?: (
        name?: string,
        newTime?: HRTime | false,
    ) => {
        [name: string]: number;
    };
    gateway?: object;
    validation?: unknown;
}

export type HRTime = [number, number];

export interface IContext {
    trace: number;
    session?: {
        [name: string]: unknown;
    };
    conId?: string;
    requests: Map<
        string,
        {$meta: IMeta; end: (error: Error) => {local: object; literals: object[]}}
    >;
    waiting: Set<(error: Error) => void>;
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
        test: TArray<TString>;
    }>;
    remote: TObject<{
        canSkipSocket: TBoolean;
    }>;
    adapter: TBoolean;
    orchestrator: TBoolean;
    test: TBoolean;
    integration: TBoolean;
    dev: TBoolean;
    sim: TBoolean;
    resolution: TBoolean;
}> {
    additionalProperties: false;
}

export interface IModuleConfig<T extends TObject = TObject> {
    pkg?: {
        name: string;
        version: string;
    };
    url: string;
    config: {
        default: Partial<Static<IBaseConfig> & Static<T>>;
        [name: string]: Partial<Static<IBaseConfig> & Static<T>>;
    };
    validation: T;
    children: (string | (() => Promise<object>))[] | ((layer: ModuleApi) => unknown)[];
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

export type GatewaySchema = (
    | {
          params: TSchema;
          result: TSchema;
      }
    | {
          body: TSchema;
          response: TSchema;
      }
    | {
          method: 'GET' | 'POST' | 'PUT' | 'DELETE';
          path?: string;
          response?: TSchema;
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

export interface ILib {
    type: JavaScriptTypeBuilder;
    error: <T>(errors: T) => Record<keyof T, (params?: unknown, $meta?: IMeta) => ITypedError>;
    rename: <T extends object>(object: T, name: string) => T & {name: string};
    ulid: () => string;
    uuid4: () => string;
    uuid7: () => string;
    merge<T, S1>(target: T, source: S1): T & S1;
    merge<T, S1, S2>(target: T, source1: S1, source2: S2): T & S1 & S2;
    merge<T, S1, S2, S3>(target: T, source1: S1, source2: S2, source3: S3): T & S1 & S2 & S3;
    merge<T>(...args: unknown[]): T;
}

export type ValidationFn = () => GatewaySchema;
export interface IValidationProxy {
    type: JavaScriptTypeBuilder;
    handler: {
        [name: string]: ValidationFn;
    };
    lib: ILib & {
        [name: string]: TSchema;
    };
    error: {
        [name: string]: (...params: unknown[]) => ITypedError;
    };
}
export type ValidationDefinition = (
    blong: IValidationProxy,
) => Record<string, ValidationFn | TSchema> | ValidationFn | ValidationFn[];

export type ApiDefinition = (blong: IValidationProxy) => {
    namespace: Record<
        string,
        string | (string | Partial<OpenAPI.Document & {'x-blong-namespace': string}>)[]
    >;
};

export type PortHandler<T, C> = <R>(
    this: ReturnType<IAdapterFactory<T, C>>,
    params: unknown,
    $meta: IMeta,
    context?: IContext,
) => Promise<R> | R;
export type PortHandlerBound = <T>(
    params: unknown,
    $meta: IMeta,
    context?: IContext,
) => Promise<T> | T;
export type LibFn = <T>(...params: unknown[]) => T;
export interface IRemoteHandler {
    [name: string]: PortHandlerBound;
}
export interface IHandlerProxy<T> {
    config: T;
    handler: {
        [name: `error${string}`]: (
            message?: string | {params?: object; cause?: Error},
        ) => ITypedError;
    } & IRemoteHandler;
    lib: ILib & {
        [name: string]: LibFn;
    };
    errors: {
        [name: string]: (...params: unknown[]) => ITypedError;
    };
    utBus: {
        info: () => {encrypt: object; sign: object};
    };
    gateway: {
        config: () => {public: {sign: object; encrypt: object}};
    };
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
    validation: (
        method: ValidationDefinition | ValidationDefinition[],
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

export type SolutionFactory<T extends TObject = TObject> = (definition: {
    type: JavaScriptTypeBuilder;
}) => IModuleConfig<T> | Promise<IModuleConfig<T>>;

const Kind: symbol = Symbol.for('blong:kind');

export abstract class Internal {
    #log: ILog;
    protected log?: ReturnType<ILog['logger']>;
    public constructor(api?: {log: ILog}) {
        this.#log = api?.log;
    }
    protected merge: ILib['merge'] = (...args) => {
        const result = merge(...args);
        if (result.logLevel && this.#log)
            this.log = this.#log.logger(result.logLevel, {name: this.constructor.name});
        return result;
    };
    public async stop(): Promise<void> {}
    public async start(...params: unknown[]): Promise<void> {}
}

export const handler = <T = Record<string, unknown>, C = AdapterContext>(
    definition: Definition<T, C>,
): Definition<T, C> => Object.defineProperty(definition, Kind, {value: 'handler'});
export const library = <T = Record<string, unknown>>(definition: Lib<T>): Lib<T> =>
    Object.defineProperty(definition, Kind, {value: 'lib'});
export const validation = (validation: ValidationDefinition): ValidationDefinition =>
    Object.defineProperty(validation, Kind, {value: 'validation'});
export const api = (api: ApiDefinition): ApiDefinition =>
    Object.defineProperty(api, Kind, {value: 'api'});

export const validationHandlers: (
    handlers: Record<string, TFunction>,
) => ValidationDefinition = handlers =>
    validation(() =>
        Object.fromEntries(
            Object.entries(handlers).map(([name, handler]) => [
                name,
                Object.defineProperty(
                    () => ({
                        params: Type.Parameters(handler).items[0],
                        result: Type.Awaited(Type.ReturnType(handler)),
                        description: handler.description,
                    }),
                    'name',
                    {value: name},
                ),
            ]),
        ),
    );

export const realm = <T extends TObject>(definition: SolutionFactory<T>): SolutionFactory<T> =>
    Object.defineProperty(definition, Kind, {value: 'solution'});
export const server = <T extends TObject>(definition: SolutionFactory<T>): SolutionFactory<T> =>
    Object.defineProperty(definition, Kind, {value: 'server'});
export const browser = <T extends TObject>(definition: SolutionFactory<T>): SolutionFactory<T> =>
    Object.defineProperty(definition, Kind, {value: 'browser'});
export const adapter = <T, C = AdapterContext>(
    definition: IAdapterFactory<T, C>,
): IAdapterFactory<T, C> => Object.defineProperty(definition, Kind, {value: 'adapter'});
export const orchestrator = <T, C = AdapterContext>(
    definition: IAdapterFactory<T, C>,
): IAdapterFactory<T, C> => Object.defineProperty(definition, Kind, {value: 'orchestrator'});
export const kind = <T>(
    what: T,
):
    | 'lib'
    | 'validation'
    | 'api'
    | 'solution'
    | 'server'
    | 'browser'
    | 'adapter'
    | 'orchestrator'
    | 'handler' => what[Kind];

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
    kind,
};
