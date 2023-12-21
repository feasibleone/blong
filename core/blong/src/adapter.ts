import PQueue from 'p-queue';
import merge from 'ut-function.merge';

import { type errors } from '../types.js';
import { type Log } from './Log.js';
import loop from './loop.js';

type config<T> = {
    id: string
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
    logLevel: Parameters<Log['logger']>[0]
    namespace: string | string[]
    imports: string | string[]
} & T

type AdapterApi = {
    adapter: (id: string) => unknown
    utError: {
        defineError
        getError
        fetchErrors
    }
    utBus: {
        register: (methods: object, namespace: string, id: string, pkg: object) => void
        subscribe: (methods: object, namespace: string, id: string, pkg: object) => void
        methodId: (name: string) => string
        getPath: (name: string) => string
    }
    utLog: {
        createLog: Log['logger']
    }
}

type hrtime = [number, number];

export interface meta {
    mtid: 'request' | 'response' | 'error' | 'notification' | 'discard',
    method: string,
    expect?: string[],
    opcode?: string,
    source?: string,
    forward?: object,
    httpResponse?: {
        type?: string,
        redirect?: string,
        code?: number,
        state?: unknown[],
        header?: string[] | [string, unknown][]
    },
    httpRequest?: {
        url: URL,
        headers: object
    },
    auth: {
        mlek: object,
        mlsk: object,
        permissionMap: Buffer,
        actorId: string | number,
        sessionId: string
    },
    language: {
        languageId: string | number
    },
    conId: number,
    destination?: string,
    dispatch?: (msg?: object, $meta?: meta) => [msg: object, $meta: meta] | boolean | Promise<boolean>,
    timeout: hrtime,
    timer?: (name?: string, newTime?: hrtime) => {
        [name: string]: number
    },
    validation?: unknown
}

type log = ReturnType<Log['logger']>

const errorMap = {
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

export type adapter<T = Record<string, unknown>> = (api: AdapterApi) => {
    config?: config<T>
    log?: log
    errors?: errors<typeof errorMap>
    imported?: ReturnType<adapter<T>>
    extends?: object | `adapter.${string}`
    init?: (this: ReturnType<adapter<T>>, ...config: Partial<config<T>>[]) => void
    start?: (this: ReturnType<adapter<T>>) => Promise<void>
    ready?: (this: ReturnType<adapter<T>>) => Promise<void>
    stop?: (this: ReturnType<adapter<T>>) => Promise<void>
    connected?: (this: ReturnType<adapter<T>>) => Promise<boolean>
    error?: (error: Error, $meta: meta) => void
    pack?: (this: ReturnType<adapter<T>>, packet: {size: number, data: Buffer}) => Buffer
    unpackSize?: (this: ReturnType<adapter<T>>, buffer: Buffer) => {size: number, data: Buffer}
    unpack?: (this: ReturnType<adapter<T>>, buffer: Buffer, options?: {size: number}) => Buffer
    encode?: (data: object[], $meta: meta, context: object, log: log) => string | Buffer
    decode?: (buff: string | Buffer, $meta: meta, context: object, log: log) => object[]
    findValidation?: (this: ReturnType<adapter<T>>, $meta: meta) => () => object
    getConversion?: (this: ReturnType<adapter<T>>, $meta: meta, type: 'send' | 'receive') => {name: string, fn: () => object}
    dispatch?: (...params: unknown[]) => Promise<unknown>
    exec?: (...params: unknown[]) => Promise<unknown>
    bytesSent?: (count: number) => void
    bytesReceived?: (count: number) => void
    msgSent?: (count: number) => void
    msgReceived?: (count: number) => void
    isConnected?: Promise<boolean>
};

export interface context {
    session?: {
        [name: string]: unknown
    },
    conId?: string,
    requests: Map<string, {$meta: meta, end: (error: Error) => {local: object, literals: object[]}}>,
    waiting: Set<(error: Error) => void>
}

let _errors: errors<typeof errorMap>;

const reserved = [
    'reducer', 'start', 'stop', 'ready', 'init', 'namespace',
    'send', 'requestSend', 'responseSend', 'errorSend',
    'receive', 'requestReceive', 'responseReceive', 'errorReceive'
];

export default async function adapter({
    adapter,
    utBus,
    utError,
    utLog,
    handlers
}) {
    _errors ||= utError.register(errorMap);

    let queue: PQueue;
    let portLoop;
    let resolveConnected;

    const connected = new Promise(resolve => {
        resolveConnected = resolve;
    });

    const base = {
        errors: _errors,
        exec: null,
        imported: {},
        config: {},
        log: null,
        async init(...configs) {
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
        error(error, $meta) {
            if (this.log?.error) {
                if (error.type && $meta?.expect?.includes?.(error.type)) return;
                if ($meta) error.method = $meta.method;
                this.log.error(error);
            }
        },
        findValidation($meta) {

        },
        handles(name) {
            if (reserved.includes(name)) return true;
            const id = this.config.id.replace(/\./g, '-');
            return [].concat(this.config.namespace || this.config.imports || id).some(namespace => name.startsWith(namespace));
        },
        methodPath(methodName) {
            return methodName.split('/', 2)[1];
        },
        getConversion($meta, type) {
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
        async dispatch(...args) {
            const result = utBus.dispatch(...args);
            if (!result) this.log?.error?.(this.errors['adapter.dispatchFailure']({ args }));
            return result;
        },
        async event(event, data?, mapper?) {
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
        findHandler(methodName) {
            methodName = utBus.methodId(methodName);
            return this.imported[methodName];
        },
        async request(...params) {
            return queue.add(portLoop(params, true));
        },
        async publish(...params) {
            queue.add(portLoop(params, false));
            return [true, params[params.length - 1]];
        },
        async ready() {
            return this.event('ready');
        },
        forNamespaces(reducer, initial) {
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
        async handle(...params) {
            const $meta = params && params.length > 1 && params[params.length - 1];
            const method = ($meta && $meta.method) || 'exec';
            const handler = this.findHandler(method) || this.imported.exec;
            if (handler instanceof Function) {
                return handler.apply(this, params);
            } else {
                throw this.errors['adapter.methodNotFound']({ params: { method } });
            }
        },
        connect(what = this.handle.bind(this), context = this.config.context) {
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

    return result;
}
