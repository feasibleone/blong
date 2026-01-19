import type {
    Config,
    Errors,
    IAdapterFactory,
    IApi,
    IErrorMap,
    IMeta,
    ITypedError,
} from '@feasibleone/blong';
import type net from 'node:net';
import PQueue from 'p-queue';
import merge from 'ut-function.merge';

import loop from './loop.js';

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
    'adapter.deadlock':
        'Method {method} was recursively called, which may cause a deadlock!\nx-b3-traceid: {traceId}\nx-ut-stack: {sequence}',
    'adapter.noMeta': '$meta not passed',
    'adapter.noMetaForward': '$meta.forward not passed to method {method}',
    'adapter.noTraceId': "$meta.forward['x-b3-traceid'] not passed to method {method}",
};

let _errors: Errors<typeof errorMap>;

const reserved: string[] = [
    'reducer',
    'start',
    'stop',
    'ready',
    'init',
    'namespace',
    'send',
    'requestSend',
    'responseSend',
    'errorSend',
    'receive',
    'requestReceive',
    'responseReceive',
    'errorReceive',
];

export default async function adapter<T>(
    {adapter, utBus, utError, utLog, handlers, remote, rpc, local, registry}: IApi,
    configBase: string,
): Promise<ReturnType<IAdapterFactory>> {
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
        configBase,
        log: null,
        async init(...configs: object[]) {
            base.config = merge({}, ...configs);
            base.log = utLog?.createLog(this.config.logLevel || 'info', {
                ...this.config.log,
                name: this.config.id,
                context: this.config.type ?? 'dispatch',
            });
            const id = this.config.id.replace(/\./g, '-');
            queue = new PQueue({concurrency: this.config.concurrency || 100});
            utBus.register(
                {
                    [`${id}.start`]: this.start,
                    [`${id}.stop`]: this.stop,
                },
                'ports',
                this.config.id,
                this.config.pkg,
            );
            utBus.subscribe(
                {
                    [`${id}.drain`]: this.drain,
                },
                'ports',
                this.config.id,
                this.config.pkg,
            );
        },
        error(error: ITypedError, $meta: IMeta) {
            if (this.log?.error) {
                if (error.type && $meta?.expect?.includes?.(error.type)) return;
                if ($meta) error.method = $meta.method;
                this.log.error(error);
            }
        },
        findValidation($meta: IMeta) {
            return null;
        },
        handles(name: string) {
            if (reserved.includes(name)) return true;
            const id = this.config.id.replace(/\./g, '-');
            return []
                .concat(this.config.namespace || this.config.imports || id)
                .some(namespace => name.startsWith(namespace));
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
            return {fn, name};
        },
        async dispatch(...args: unknown[]) {
            const result = utBus.dispatch(...args);
            if (!result) this.log?.error?.(this.errors['adapter.dispatchFailure']({args}));
            return result;
        },
        async event(event: string, data?: object, mapper?: string) {
            this.log?.info?.({$meta: {mtid: 'event', method: `adapter.${event}`}, ...data});
            const eventHandlers = [];
            this.importedMap?.forEach(
                imp =>
                    Object.prototype.hasOwnProperty.call(imp, event) &&
                    eventHandlers.push(imp[event]),
            );
            let result = data;
            switch (mapper) {
                case 'asyncMap':
                    result = await Promise.all(
                        eventHandlers.map(handler => handler.call(this, data)),
                    );
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
        drain() {},
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
            return []
                .concat(this.config.namespace || this.config.imports || id)
                .reduce(reducer.bind(this), initial);
        },
        async start() {
            await utBus.attachHandlers(this, this.config.imports, true);
            const {req, pub} = this.forNamespaces(
                (prev, next) => {
                    if (typeof next === 'string') {
                        prev.req[`${next}.request`] = this.request.bind(this);
                        prev.pub[`${next}.publish`] = this.publish.bind(this);
                    }
                    return prev;
                },
                {req: {}, pub: {}},
            );
            utBus.register(req, 'ports', this.config.id, this.config.pkg);
            utBus.subscribe(pub, 'ports', this.config.id, this.config.pkg);
            const {context, ...config} = this.config; // eslint-disable-line @typescript-eslint/no-unused-vars
            return this.event('start', {configBase: this.configBase, config});
        },
        async handle(...params: unknown[]) {
            const $meta = params && params.length > 1 && (params[params.length - 1] as IMeta);
            const method = ($meta && $meta.method) || 'exec';
            const handler = this.findHandler(method) || this.imported.exec;
            if (handler instanceof Function) {
                return handler.apply(this, params);
            } else {
                throw this.errors['adapter.methodNotFound']({params: {method}});
            }
        },
        connect(
            what: net.Socket | (() => void) = this.handle.bind(this),
            context: Parameters<typeof loop>[2] = this.config.context,
        ) {
            portLoop = loop(what, this, context);
            resolveConnected(true);
        },
        async connected() {
            return connected;
        },
        async stop() {
            return this.event('stop');
        },
    };

    const result = handlers({utError});
    let current = result;
    while (current.extends) {
        const parent = await (typeof current.extends === 'string'
            ? adapter(current.extends)({utError, remote, rpc, local, registry})
            : current.extends({utError, remote, rpc, local, registry}));
        Object.setPrototypeOf(current, parent);
        current = parent;
    }
    Object.setPrototypeOf(current, base);

    return result as ReturnType<IAdapterFactory>;
}
