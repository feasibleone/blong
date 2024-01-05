import type net from 'node:net';
import PQueue from 'p-queue';
import merge from 'ut-function.merge';

import type { Errors, ITypedError } from '../types.js';
import { IMeta } from '../types.js';
import type { IGateway } from './Gateway.js';
import type { ILog } from './Log.js';
import type { IErrorFactory, IErrorMap } from './error.js';
import loop from './loop.js';

type Config<T> = {
    id: string
    type: string
    pkg: {
        name: string
        version: string
    }
    format?: {
        sizeAdjust?: number
    }
    context: object
    debug: boolean
    test: boolean
    disconnectOnError: boolean
    concurrency: number
    log: object
    maxReceiveBuffer: number
    logLevel: Parameters<ILog['logger']>[0]
    namespace: string | string[]
    imports: string | string[]
} & T

type Logger = ReturnType<ILog['logger']>

interface IError {
    getError: IErrorFactory['get']
    fetchErrors: IErrorFactory['fetch']
    defineError: IErrorFactory['define']
    register: IErrorFactory['register']
}

interface IApi {
    id?: string
    adapter: (id: string) => (api: {utError:IError}) => object
    utError: IError
    error: IErrorFactory
    gateway: IGateway
    utBus: {
        config: object,
        register: (methods: object, namespace: string, id: string, pkg: {version: string}) => void
        unregister: (methods: string[], namespace: string) => void
        subscribe: (methods: object, namespace: string, id: string, pkg: {version: string}) => void
        unsubscribe: (methods: string[], namespace: string) => void
        dispatch: (...params: unknown[]) => boolean | Promise<unknown>
        methodId: (name: string) => string
        getPath: (name: string) => string
        importMethod: (methodName, options?) => (...params: unknown[]) => Promise<unknown>
        attachHandlers: (target: object, patterns: unknown) => unknown
    }
    utLog: {
        createLog: ILog['logger']
    }
    handlers?: (api: {utError:IError}) => {extends?: string | ((api: {utError:IError}) => object)}
}

export type HRTime = [number, number];

const errorMap: IErrorMap = {
    'adapter.configValidation': 'Adapter config validation:\r\n{message}',
    'adapter.missingParameters': 'Missing parameters',
    'adapter.missingMeta': 'Missing metadata',
    'adapter.notConnected': 'No connection',
    'adapter.disconnect': 'Adapter disconnected',
    'adapter.disconnectBeforeResponse': 'Disconnect before response received',
    'adapter.stream': 'Adapter stream error',
    'adapter.timeout': 'Timeout',
    'adapter.echoTimeout': 'Echo retries limit exceeded',
    'adapter.unhandled': 'Unhandled adapter error',
    'adapter.bufferOverflow': 'Message size of {size} exceeds the maximum of {max}',
    'adapter.socketTimeout': 'Socket timeout',
    'adapter.receiveTimeout': 'Receive timeout',
    'adapter.dispatchFailure': 'Cannot dispatch message to bus',
    'adapter.methodNotFound': 'Method {method} not found',
    'adapter.queueNotFound': 'Queue not found',
    'adapter.invalidPullStream': 'Invalid pull stream',
    'adapter.paramsValidation': 'Method {method} parameters failed validation for: {fields}',
    'adapter.resultValidation': 'Method {method} result failed validation for: {fields}',
    'adapter.deadlock': 'Method {method} was recursively called, which may cause a deadlock!\nx-b3-traceid: {traceId}\nx-ut-stack: {sequence}',
    'adapter.noMeta': '$meta not passed',
    'adapter.noMetaForward': '$meta.forward not passed to method {method}',
    'adapter.noTraceId': '$meta.forward[\'x-b3-traceid\'] not passed to method {method}'
};

interface IAdapter<T> {
    config?: Config<T>
    log?: Logger
    errors?: Errors<typeof errorMap>
    imported?: ReturnType<IAdapterFactory<T>>
    extends?: object | `adapter.${string}`
    init?: (this: ReturnType<IAdapterFactory<T>>, ...config: Partial<Config<T>>[]) => void
    start?: (this: ReturnType<IAdapterFactory<T>>) => Promise<object>
    ready?: (this: ReturnType<IAdapterFactory<T>>) => Promise<object>
    stop?: (this: ReturnType<IAdapterFactory<T>>) => Promise<object>
    connected?: (this: ReturnType<IAdapterFactory<T>>) => Promise<boolean>
    error?: (error: Error, $meta: IMeta) => void
    pack?: (this: ReturnType<IAdapterFactory<T>>, packet: {size: number, data: Buffer}) => Buffer
    unpackSize?: (this: ReturnType<IAdapterFactory<T>>, buffer: Buffer) => {size: number, data: Buffer}
    unpack?: (this: ReturnType<IAdapterFactory<T>>, buffer: Buffer, options?: {size: number}) => Buffer
    encode?: (data: unknown, $meta: IMeta, context: object, log: Logger) => string | Buffer
    decode?: (buff: string | Buffer, $meta: IMeta, context: object, log: Logger) => object[]
    request?: () => Promise<unknown>
    publish?: () => Promise<unknown>
    drain?: () => void
    findValidation?: (this: ReturnType<IAdapterFactory<T>>, $meta: IMeta) => () => object
    getConversion?: (this: ReturnType<IAdapterFactory<T>>, $meta: IMeta, type: 'send' | 'receive') => {name: string, fn: () => object}
    findHandler?: (this: ReturnType<IAdapterFactory<T>>, name: string) => () => unknown
    handles?: (this: ReturnType<IAdapterFactory<T>>, name: string) => boolean
    forNamespaces?: <T>(reducer: (prev: T, current: unknown) => T, initial: T) => T
    methodPath?: (name: string) => string
    dispatch?: (...params: unknown[]) => Promise<unknown>
    exec?: (...params: unknown[]) => Promise<unknown>
    bytesSent?: (count: number) => void
    bytesReceived?: (count: number) => void
    msgSent?: (count: number) => void
    msgReceived?: (count: number) => void
    isConnected?: Promise<boolean>
    event?: (name: string, params?: unknown) => Promise<object>
    handle?: (...params: unknown[]) => Promise<unknown>
    connect?: (what:unknown, context: {requests: unknown, waiting: unknown, buffer: unknown}) => void
};

export interface IAdapterFactory<T = Record<string, unknown>> {
    config?: unknown
    (api: IApi): IAdapter<T>
}

export interface IContext {
    session?: {
        [name: string]: unknown
    },
    conId?: string,
    requests: Map<string, {$meta: IMeta, end: (error: Error) => {local: object, literals: object[]}}>,
    waiting: Set<(error: Error) => void>
}

let _errors: Errors<typeof errorMap>;

const reserved: string[] = [
    'reducer', 'start', 'stop', 'ready', 'init', 'namespace',
    'send', 'requestSend', 'responseSend', 'errorSend',
    'receive', 'requestReceive', 'responseReceive', 'errorReceive'
];

export default async function adapter<T>({
    adapter,
    utBus,
    utError,
    utLog,
    handlers
}: IApi): Promise<ReturnType <IAdapterFactory>> {
    _errors ||= utError.register(errorMap);

    let queue: PQueue;
    let portLoop;
    let resolveConnected;

    const connected = new Promise<boolean>(resolve => {
        resolveConnected = resolve;
    });

    const base: ReturnType<IAdapterFactory<T>> = {
        errors: _errors,
        exec: null,
        imported: {},
        config: {} as Config<T>,
        log: null,
        async init(...configs: object[]) {
            base.config = merge({}, ...configs);
            base.log = utLog?.createLog(this.config.logLevel || 'info', { ...this.config.log, name: this.config.id, context: (this.config.type ?? 'dispatch')});
            const id = this.config.id.replace(/\./g, '-');
            const PQueue = (await import('p-queue')).default;
            queue = new PQueue({concurrency: this.config.concurrency || 100});
            utBus.register({
                [`${id}.start`]: this.start,
                [`${id}.stop`]: this.stop
            }, 'ports', this.config.id, this.config.pkg);
            utBus.subscribe({
                [`${id}.drain`]: this.drain
            }, 'ports', this.config.id, this.config.pkg);
        },
        error(error: ITypedError, $meta: IMeta) {
            if (this.log?.error) {
                if (error.type && $meta?.expect?.includes?.(error.type)) return;
                if ($meta) error.method = $meta.method;
                this.log.error(error);
            }
        },
        findValidation($meta: IMeta) {
            return null
        },
        handles(name: string) {
            if (reserved.includes(name)) return true;
            const id = this.config.id.replace(/\./g, '-');
            return [].concat(this.config.namespace || this.config.imports || id).some(namespace => name.startsWith(namespace));
        },
        methodPath(methodName: string) {
            return methodName.split('/', 2)[1];
        },
        getConversion($meta: IMeta, type: 'send' | 'receive') {
            let fn;
            let name;
            if ($meta) {
                if ($meta.method) {
                    const path = utBus.getPath($meta.method);
                    name = [path, $meta.mtid, type].join('.');
                    fn = this.findHandler(name);
                    if (!fn) {
                        name = [this.methodPath(path), $meta.mtid, type].join('.');
                        fn = this.findHandler(name);
                    }
                }
                if (!fn) {
                    name = [$meta.opcode, $meta.mtid, type].join('.');
                    fn = this.findHandler(name);
                }
                if (!fn) {
                    name = [$meta.mtid, type].join('.');
                    fn = this.findHandler(name);
                }
            }
            if (!fn && (!$meta || $meta.mtid !== 'event')) {
                name = type;
                fn = this.findHandler(name);
            }
            return { fn, name };
        },
        async dispatch(...args: unknown[]) {
            const result = utBus.dispatch(...args);
            if (!result) this.log?.error?.(this.errors['adapter.dispatchFailure']({ args }));
            return result;
        },
        async event(event: string, data?: object, mapper?: string) {
            this.log?.info?.({$meta: {mtid: 'event', method: `adapter.${event}`}, ...data});
            const eventHandlers = [];
            this.importedMap?.forEach(imp => Object.prototype.hasOwnProperty.call(imp, event) && eventHandlers.push(imp[event]));
            let result = data;
            switch (mapper) {
                case 'asyncMap':
                    result = await Promise.all(eventHandlers.map(handler => handler.call(this, data)));
                    break;
                case 'reduce':
                default:
                    for (const eventHandler of eventHandlers) {
                        result = await eventHandler.call(this, result);
                    }
                    break;
            }
            // await(this.bus && typeof this.bus.portEvent instanceof Function && this.bus.portEvent(event, this));
            return result;
        },
        drain() {

        },
        findHandler(methodName: string) {
            methodName = utBus.methodId(methodName);
            return this.imported[methodName];
        },
        async request(...params: unknown[]) {
            return queue.add(portLoop(params, true));
        },
        async publish(...params: unknown[]) {
            await queue.add(portLoop(params, false));
            return [true, params[params.length - 1]];
        },
        async ready() {
            return this.event('ready');
        },
        forNamespaces<T>(reducer: (prev: T, current: unknown) => T, initial: T) {
            const id = this.config.id.replace(/\./g, '-');
            return [].concat(this.config.namespace || this.config.imports || id).reduce(reducer.bind(this), initial);
        },
        async start() {
            await utBus.attachHandlers(this, this.config.imports);
            const {req, pub} = this.forNamespaces((prev, next) => {
                if (typeof next === 'string') {
                    prev.req[`${next}.request`] = this.request.bind(this);
                    prev.pub[`${next}.publish`] = this.publish.bind(this);
                }
                return prev;
            }, {req: {}, pub: {}});
            utBus.register(req, 'ports', this.config.id, this.config.pkg);
            utBus.subscribe(pub, 'ports', this.config.id, this.config.pkg);
            return this.event('start', {config: this.config});
        },
        async handle(...params: unknown[]) {
            const $meta = params && params.length > 1 && params[params.length - 1] as IMeta;
            const method = ($meta && $meta.method) || 'exec';
            const handler = this.findHandler(method) || this.imported.exec;
            if (handler instanceof Function) {
                return handler.apply(this, params);
            } else {
                throw this.errors['adapter.methodNotFound']({ params: { method } });
            }
        },
        connect(what: net.Socket | (() => void) = this.handle.bind(this), context: Parameters<typeof loop>[2] = this.config.context) {
            portLoop = loop(what, this, context);
            resolveConnected(true);
        },
        async connected() {
            return connected;
        },
        async stop() {
            return this.event('stop');
        }
    };

    const result = handlers({utError});
    let current = result;
    while (current.extends) {
        const parent = await (typeof current.extends === 'string' ? adapter(current.extends)({utError}) : current.extends({utError}));
        Object.setPrototypeOf(current, parent);
        current = parent;
    }
    Object.setPrototypeOf(current, base);

    return result as ReturnType<IAdapterFactory>;
}
