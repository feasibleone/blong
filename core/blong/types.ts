import { TSchema, Type } from '@sinclair/typebox';
import merge from 'ut-function.merge';

import type { IAdapterFactory as adapterFactory, IContext } from './src/adapter.js';

export interface IMeta {
    mtid?: 'request' | 'response' | 'error' | 'notification' | 'discard' | 'event';
    request?: IMeta;
    stream?: unknown;
    trace?: string;
    retry?: number;
    method: string;
    expect?: string[];
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
    destination?: string;
    dispatch?: (msg?: object, $meta?: IMeta) => [msg: object, $meta: IMeta] | boolean | void | Promise<boolean>;
    reply?: unknown;
    timeout?: number;
    timer?: (name?: string, newTime?: HRTime | false) => {
        [name: string]: number;
    };
    gateway?: object;
    validation?: unknown;
}

import { HRTime } from './src/adapter.js';
export { default } from './src/load.js';

export interface ITypedError extends Error {
    type: string
    cause?: Error
    print?: string
    method?: string | string[]
    params?: object
    code?: string
    req?: {
        httpVersion: string
        url: URL
        method: string
    }
    res?: {
        httpVersion: string
        statusCode: number
    }
}

export type Errors<T> = {
    [name in keyof T]: (params?: unknown, $meta?: IMeta) => ITypedError
}

export interface IModuleConfig {
    pkg: {
        name: string
        version: string
    },
    url: string,
    default: object
    validation: TSchema
    children: string[]
}

interface IStep {
    name: string
    method?: string
}
type Sequence = (boolean | string | IStep)[];

export type GatewaySchema = ({
    params: TSchema
    result: TSchema
} | {
    body: TSchema
    response: TSchema
} | {
    method: 'GET',
    path?: string
    response?: TSchema
} | {
    auth: false | 'basic' | 'login'
}) & {
    auth?: false | 'basic' | 'login'
    security?: true
}

interface ILib {
    Type: typeof Type
    error: <T>(errors: T) => Record<keyof T, (params?: unknown, $meta?: IMeta) => ITypedError>
    merge<T, S1>(target: T, source: S1) : T & S1
    merge<T, S1, S2>(target: T, source1: S1, source2: S2) : T & S1 & S2
    merge<T, S1, S2, S3>(target: T, source1: S1, source2: S2, source3: S3) : T & S1 & S2 & S3
    merge<T>(...args: unknown[]) : T
}

type ValidationFn = () => GatewaySchema
export interface IValidationProxy {
    Type: typeof Type
    handler: {
        [name: string]: ValidationFn;
    },
    lib: ILib & {
        [name: string]: TSchema;
    },
    error: {
        [name: string]: (...params: unknown[]) => ITypedError
    }
}
type ValidationDefinition = (fo: IValidationProxy) => Record<string, ValidationFn | TSchema> | ValidationFn | ValidationFn[]

type PortHandler = <T>(this: ReturnType<adapterFactory>, params: unknown, $meta: IMeta, context?: IContext) => Promise<T> | T
type PortHandlerBound = <T>(params: unknown, $meta: IMeta, context?: IContext) => Promise<T> | T
type LibFn = <T>(...params: unknown[]) => T;
export interface IHandlerProxy<T> {
    config: T
    handler: {
        [name: `error${string}`]: (message?: string | { params?: object; cause?: Error }) => ITypedError;
    } & {
        [name: string]: PortHandlerBound;
    }
    lib: ILib & {
        [name: string]: LibFn
    }
    error: {
        [name: string]: (...params: unknown[]) => ITypedError
    }
    utBus: {
        info: () => {encrypt: object, sign: object}
    },
    gateway: {
        config: () => {public: {sign: object, encrypt: object}}
    }
}

type ImportProxyCallback<T> = (fo: IHandlerProxy<T>) => PortHandler | adapterFactory | Record<string, PortHandler>
type Definition<T> = object | ImportProxyCallback<T> | ImportProxyCallback<T>[]

type LibProxyCallback<T> = (fo: IHandlerProxy<T>) => Record<string, LibFn> | LibFn
type Lib<T> = object | LibProxyCallback<T> | LibProxyCallback<T>[]

export type ModuleApi = {
    config: Record<string, unknown>
    parent: adapterFactory
    error: (errors: object) => ModuleApi
    validation: (method: ValidationDefinition | ValidationDefinition[], namespace?: string) => ModuleApi
    sequence: (fn: () => Sequence) => ModuleApi
    feature: (paths: string | string[]) => ModuleApi
    step: (step: Record<string, () => IStep>) => ModuleApi
} & {
    [name: string]: (fo: Definition<Record<string, unknown>>) => ModuleApi
}

export type SolutionFactory = (definition: {Type: typeof Type}) => IModuleConfig | Promise<IModuleConfig>

const Kind: symbol = Symbol('kind');

export abstract class Internal {
    protected merge: typeof merge = merge;
    public async stop(): Promise<void> {}
    public async start(...params: unknown[]): Promise<void> {}
}

export const handler = <T = Record<string, unknown>>(definition: Definition<T>): Definition<T> => Object.defineProperty(definition, Kind, {value: 'handler'});
export const library = <T = Record<string, unknown>>(definition: Lib<T>): Lib<T> => Object.defineProperty(definition, Kind, {value: 'lib'});
export const validation = (validation: ValidationDefinition): ValidationDefinition => Object.defineProperty(validation, Kind, {value: 'validation'});
export const realm = (definition: SolutionFactory): SolutionFactory => Object.defineProperty(definition, Kind, {value: 'solution'});
export const server = (definition: SolutionFactory): SolutionFactory => Object.defineProperty(definition, Kind, {value: 'server'});
export const browser = (definition: SolutionFactory): SolutionFactory => Object.defineProperty(definition, Kind, {value: 'browser'});
export const adapter = <T>(definition: adapterFactory<T>): adapterFactory<T> => Object.defineProperty(definition, Kind, {value: 'adapter'});
export const kind = <T>(what:T): 'lib' | 'validation' | 'solution' | 'server' | 'browser' | 'adapter' | 'handler' => what[Kind];
