import {Type, type JavaScriptTypeBuilder, type TFunction, type TSchema} from '@sinclair/typebox';
import type {Level, LogFn, Logger as PinoLogger} from 'pino';
import merge from 'ut-function.merge';

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
        message: string
    ): (params?: unknown, $meta?: IMeta) => ITypedError;
    register<T>(errorsMap: T): Record<keyof T, (params?: unknown, $meta?: IMeta) => ITypedError>;
}

interface IError {
    getError: IErrorFactory['get'];
    fetchErrors: IErrorFactory['fetch'];
    defineError: IErrorFactory['define'];
    register: IErrorFactory['register'];
}

export type Config<T> = {
    id: string;
    type: string;
    pkg: {
        name: string;
        version: string;
    };
    format?: {
        sizeAdjust?: number;
    };
    context: object;
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

export interface IApi {
    id?: string;
    adapter: (id: string) => (api: {utError: IError; remote: IRemote}) => object;
    utError: IError;
    errors: IErrorFactory;
    gateway: unknown;
    remote: IRemote;
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
        attachHandlers: (target: object, patterns: unknown) => unknown;
    };
    utLog: {
        createLog: ILog['logger'];
    };
    handlers?: (api: {utError: IError}) => {
        extends?: string | ((api: {utError: IError; remote: IRemote}) => object);
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

interface IAdapter<T> {
    config?: Config<T>;
    log?: ILogger;
    errors?: Errors<IErrorMap>;
    imported?: ReturnType<IAdapterFactory<T>>;
    extends?: object | `adapter.${string}` | `orchestrator.${string}`;
    init?: (this: ReturnType<IAdapterFactory<T>>, ...config: Partial<Config<T>>[]) => void;
    start?: (this: ReturnType<IAdapterFactory<T>>) => Promise<object>;
    ready?: (this: ReturnType<IAdapterFactory<T>>) => Promise<object>;
    stop?: (this: ReturnType<IAdapterFactory<T>>) => Promise<object>;
    connected?: (this: ReturnType<IAdapterFactory<T>>) => Promise<boolean>;
    error?: (error: Error, $meta: IMeta) => void;
    pack?: (this: ReturnType<IAdapterFactory<T>>, packet: {size: number; data: Buffer}) => Buffer;
    unpackSize?: (
        this: ReturnType<IAdapterFactory<T>>,
        buffer: Buffer
    ) => {size: number; data: Buffer};
    unpack?: (
        this: ReturnType<IAdapterFactory<T>>,
        buffer: Buffer,
        options?: {size: number}
    ) => Buffer;
    encode?: (data: unknown, $meta: IMeta, context: object, log: ILogger) => string | Buffer;
    decode?: (buff: string | Buffer, $meta: IMeta, context: object, log: ILogger) => object[];
    request?: () => Promise<unknown>;
    publish?: () => Promise<unknown>;
    drain?: () => void;
    findValidation?: (this: ReturnType<IAdapterFactory<T>>, $meta: IMeta) => () => object;
    getConversion?: (
        this: ReturnType<IAdapterFactory<T>>,
        $meta: IMeta,
        type: 'send' | 'receive'
    ) => {name: string; fn: () => object};
    findHandler?: (this: ReturnType<IAdapterFactory<T>>, name: string) => () => unknown;
    handles?: (this: ReturnType<IAdapterFactory<T>>, name: string) => boolean;
    forNamespaces?: <T>(reducer: (prev: T, current: unknown) => T, initial: T) => T;
    methodPath?: (name: string) => string;
    dispatch?: (...params: unknown[]) => Promise<unknown>;
    exec?: (this: ReturnType<IAdapterFactory<T>>, ...params: unknown[]) => Promise<unknown>;
    bytesSent?: (count: number) => void;
    bytesReceived?: (count: number) => void;
    msgSent?: (count: number) => void;
    msgReceived?: (count: number) => void;
    isConnected?: Promise<boolean>;
    event?: (name: string, params?: unknown) => Promise<object>;
    handle?: (...params: unknown[]) => Promise<unknown>;
    connect?: (
        what: unknown,
        context: {requests: unknown; waiting: unknown; buffer: unknown}
    ) => void;
}

export interface IAdapterFactory<T = Record<string, unknown>> {
    config?: unknown;
    (api: IApi): IAdapter<T>;
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
        $meta?: IMeta
    ) => [msg: object, $meta: IMeta] | boolean | void | Promise<boolean>;
    reply?: unknown;
    timeout?: number;
    timer?: (
        name?: string,
        newTime?: HRTime | false
    ) => {
        [name: string]: number;
    };
    gateway?: object;
    validation?: unknown;
}

type HRTime = [number, number];

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

export interface IModuleConfig {
    pkg?: {
        name: string;
        version: string;
    };
    url: string;
    config: {
        default: object;
        [name: string]: object;
    };
    validation: TSchema;
    children: string[] | ((layer: ModuleApi) => unknown)[];
}

export interface ILogger {
    trace?: LogFn;
    debug?: LogFn;
    info?: LogFn;
    warn?: LogFn;
    error?: LogFn;
    fatal?: LogFn;
}

interface IStep {
    name: string;
    method?: string;
}
type Sequence = (boolean | string | IStep)[];

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
          method: 'GET';
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
    description?: string;
    security?: true;
    basePath?: string;
};

interface ILib {
    type: JavaScriptTypeBuilder;
    error: <T>(errors: T) => Record<keyof T, (params?: unknown, $meta?: IMeta) => ITypedError>;
    rename: <T>(object: T, name: string) => T & {name: string};
    merge<T, S1>(target: T, source: S1): T & S1;
    merge<T, S1, S2>(target: T, source1: S1, source2: S2): T & S1 & S2;
    merge<T, S1, S2, S3>(target: T, source1: S1, source2: S2, source3: S3): T & S1 & S2 & S3;
    merge<T>(...args: unknown[]): T;
}

type ValidationFn = () => GatewaySchema;
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
type ValidationDefinition = (
    blong: IValidationProxy
) => Record<string, ValidationFn | TSchema> | ValidationFn | ValidationFn[];

type ApiDefinition = (blong: IValidationProxy) => {
    namespace: Record<string, string | string[]>;
};

type PortHandler = <T>(
    this: ReturnType<IAdapterFactory>,
    params: unknown,
    $meta: IMeta,
    context?: IContext
) => Promise<T> | T;
type PortHandlerBound = <T>(params: unknown, $meta: IMeta, context?: IContext) => Promise<T> | T;
type LibFn = <T>(...params: unknown[]) => T;
export interface IRemoteHandler {
    [name: string]: PortHandlerBound;
}
export interface IHandlerProxy<T> {
    config: T;
    handler: {
        [name: `error${string}`]: (
            message?: string | {params?: object; cause?: Error}
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

type ImportProxyCallback<T> = (
    blong: IHandlerProxy<T>
) => PortHandler | IAdapterFactory | Record<string, PortHandler>;
type Definition<T> = object | ImportProxyCallback<T> | ImportProxyCallback<T>[];

type LibProxyCallback<T> = (blong: IHandlerProxy<T>) => Record<string, LibFn> | LibFn;
type Lib<T> = object | LibProxyCallback<T> | LibProxyCallback<T>[];

export type ModuleApi = {
    config: Record<string, unknown>;
    parent: IAdapterFactory;
    error: (errors: object) => ModuleApi;
    validation: (
        method: ValidationDefinition | ValidationDefinition[],
        namespace?: string
    ) => ModuleApi;
    sequence: (fn: () => Sequence) => ModuleApi;
    feature: (paths: string | string[]) => ModuleApi;
    step: (step: Record<string, () => IStep>) => ModuleApi;
} & {
    [name: string]: (blong: Definition<Record<string, unknown>>) => ModuleApi;
};

export type SolutionFactory = (definition: {
    type: JavaScriptTypeBuilder;
}) => IModuleConfig | Promise<IModuleConfig>;

const Kind: symbol = Symbol('kind');

export abstract class Internal {
    protected merge: typeof merge = merge;
    public async stop(): Promise<void> {}
    public async start(...params: unknown[]): Promise<void> {}
}

export const handler = <T = Record<string, unknown>>(definition: Definition<T>): Definition<T> =>
    Object.defineProperty(definition, Kind, {value: 'handler'});
export const library = <T = Record<string, unknown>>(definition: Lib<T>): Lib<T> =>
    Object.defineProperty(definition, Kind, {value: 'lib'});
export const validation = (validation: ValidationDefinition): ValidationDefinition =>
    Object.defineProperty(validation, Kind, {value: 'validation'});
export const api = (api: ApiDefinition): ApiDefinition =>
    Object.defineProperty(api, Kind, {value: 'api'});

export const validationHandlers: (
    handlers: Record<string, TFunction>
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
                    {value: name}
                ),
            ])
        )
    );

export const realm = (definition: SolutionFactory): SolutionFactory =>
    Object.defineProperty(definition, Kind, {value: 'solution'});
export const server = (definition: SolutionFactory): SolutionFactory =>
    Object.defineProperty(definition, Kind, {value: 'server'});
export const browser = (definition: SolutionFactory): SolutionFactory =>
    Object.defineProperty(definition, Kind, {value: 'browser'});
export const adapter = <T>(definition: IAdapterFactory<T>): IAdapterFactory<T> =>
    Object.defineProperty(definition, Kind, {value: 'adapter'});
export const orchestrator = <T>(definition: IAdapterFactory<T>): IAdapterFactory<T> =>
    Object.defineProperty(definition, Kind, {value: 'orchestrator'});
export const kind = <T>(
    what: T
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
