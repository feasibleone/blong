import { TSchema, Type } from '@sinclair/typebox';
import merge from 'ut-function.merge';

import type { adapter as adapterFactory, context, meta } from './src/adapter.js';
export {default} from './src/load.js';

export interface TypedError extends Error {
    type: string
    cause?: Error
    print?: string
}

export type errors<T> = {
    [name in keyof T]: (params?: unknown, $meta?: meta) => TypedError
}

export type config = {
    pkg: {
        name: string
        version: string
    },
    default: object
    validation: object
    [env: string]: unknown
}

interface step {
    name: string
    method?: string
}
type sequence = (boolean | string | step)[];

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

interface baseLib {
    Type: typeof Type
    error: <T>(errors: T) => Record<keyof T, (params?: unknown, $meta?: meta) => TypedError>
    merge<T, S1>(target: T, source: S1) : T & S1
    merge<T, S1, S2>(target: T, source1: S1, source2: S2) : T & S1 & S2
    merge<T, S1, S2, S3>(target: T, source1: S1, source2: S2, source3: S3) : T & S1 & S2 & S3
    merge<T>(...args: unknown[]) : T
}

type validationFn = () => GatewaySchema
export type validationProxy = {
    Type: typeof Type
    handler: {
        [name: string]: validationFn;
    },
    lib: baseLib & {
        [name: string]: TSchema;
    },
    error: {
        [name: string]: (...params: unknown[]) => TypedError
    }
}
type validationDefinition = (fo: validationProxy) => Record<string, validationFn | TSchema> | validationFn | validationFn[]

type portHandler = <T>(this: ReturnType<adapterFactory>, params: unknown, $meta: meta, context?: context) => Promise<T> | T
type portHandlerBound = <T>(params: unknown, $meta: meta, context?: context) => Promise<T> | T
type libFn = <T>(...params: unknown[]) => T;
export type handlerProxy<T> = {
    config: T
    handler: {
        [name: `error${string}`]: (message?: string | { params?: object; cause?: Error }) => TypedError;
    } & {
        [name: string]: portHandlerBound;
    }
    lib: baseLib & {
        [name: string]: libFn
    }
    error: {
        [name: string]: (...params: unknown[]) => TypedError
    }
    utBus: {
        info: () => {encrypt: object, sign: object}
    },
    gateway: {
        config: () => {public: {sign: object, encrypt: object}}
    }
}

type importProxyCallback<T> = (fo: handlerProxy<T>) => portHandler | adapterFactory | Record<string, portHandler>
type definition<T> = object | importProxyCallback<T> | importProxyCallback<T>[]

type libProxyCallback<T> = (fo: handlerProxy<T>) => Record<string, libFn> | libFn
type lib<T> = object | libProxyCallback<T> | libProxyCallback<T>[]

export type moduleApi = {
    config: Record<string, unknown>
    parent: adapterFactory
    error: (errors: object) => moduleApi
    validation: (method: validationDefinition | validationDefinition[], namespace?: string) => moduleApi
    sequence: (fn: () => sequence) => moduleApi
    feature: (paths: string | string[]) => moduleApi
    step: (step: Record<string, () => step>) => moduleApi
} & {
    [name: string]: (fo: definition<Record<string, unknown>>) => moduleApi
}

type solutionDef = (definition: {Type: typeof Type}) => unknown

const Kind = Symbol('kind');

export abstract class internal {
    merge = merge;
    async stop() {}
    async start(...params: unknown[]) {}
}

export const handler = <T = Record<string, unknown>>(definition: definition<T>) => Object.defineProperty(definition, Kind, {value: 'handler'});
export const library = <T = Record<string, unknown>>(definition: lib<T>) => Object.defineProperty(definition, Kind, {value: 'lib'});
export const validation = (validation: validationDefinition) => Object.defineProperty(validation, Kind, {value: 'validation'});
export const realm = (definition: solutionDef) => Object.defineProperty(definition, Kind, {value: 'solution'});
export const server = (definition: solutionDef) => Object.defineProperty(definition, Kind, {value: 'server'});
export const browser = (definition: solutionDef) => Object.defineProperty(definition, Kind, {value: 'browser'});
export const adapter = <T>(definition: adapterFactory<T>) => Object.defineProperty(definition, Kind, {value: 'adapter'});
export const kind = what => what[Kind];
