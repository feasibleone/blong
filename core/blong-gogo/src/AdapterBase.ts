import type {
    Adapter,
    Config,
    Errors,
    IApi,
    IContext,
    IErrorMap,
    IMeta,
    ITypedError,
    PortHandlerBound,
} from '@feasibleone/blong/types';
import type net from 'node:net';
import PQueue from 'p-queue';
import merge from 'ut-function.merge';

import ConfigRuntime from './ConfigRuntime.ts';
import loop from './loop.ts';

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

/**
 * AdapterBase — the runtime-provided base class for all adapters.
 *
 * This class replaces the plain-object literal that was previously defined
 * inline in `adapter()`.  It is exposed through the runtime injection
 * mechanism — realms and solutions never import it directly.  Custom
 * adapters extend it via prototype-chain inheritance
 * (`Object.setPrototypeOf(current, baseInstance)`), preserving the existing
 * hot-reload semantics.
 */
type AdapterHandlerContext = {
    importedMap: Map<string, object>;
    imported: object;
    config: {namespace?: string | string[]};
};

export class AdapterBase<T, C extends IContext> {
    errors = _errors;
    exec: unknown = null;
    imported: Record<string, PortHandlerBound> = {};
    config: Config<T, C> = {} as Config<T, C>;
    configBase: string;
    log: unknown = null;
    importedMap?: Map<string, Record<string, (...args: unknown[]) => unknown>>;

    // These are prefixed with _ rather than using # private class fields.
    // The adapter uses Object.setPrototypeOf(current, base) to set the base as
    // the prototype of the plain handler-result object.  When prototype methods
    // are then called on `current`, `this` is `current` (not `base`), so
    // JavaScript's brand-checking on # private fields throws.  Regular
    // properties are found via normal prototype-chain lookup, which works.
    _register: IApi['register'];
    _subscribe: IApi['subscribe'];
    _dispatch: IApi['dispatch'];
    _methodId: IApi['methodId'];
    _getPath: IApi['getPath'];
    // _api is stored (not _attachHandlers directly) because Registry.ts sets
    // api.attachHandlers = ... only *after* the port factory returns.  Storing
    // the api object and reading api.attachHandlers lazily (at call time)
    // ensures we always see the real function rather than the initial undefined.
    _api: Pick<IApi, 'attachHandlers'>;
    _createLog: IApi['createLog'];
    _attachCheckpoint: IApi['attachCheckpoint'];
    _activationNames: string[];
    _queue?: PQueue;
    _portLoop: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    _resolveConnected?: (value: boolean) => void;
    _connected: Promise<boolean>;

    constructor(
        api: Pick<
            IApi,
            | 'register'
            | 'subscribe'
            | 'dispatch'
            | 'methodId'
            | 'getPath'
            | 'attachHandlers'
            | 'createLog'
            | 'attachCheckpoint'
        >,
        configBase: string,
        activationNames: string[] = [],
    ) {
        this.configBase = configBase;
        this._register = api.register;
        this._subscribe = api.subscribe;
        this._dispatch = api.dispatch;
        this._methodId = api.methodId;
        this._getPath = api.getPath;
        this._api = api;
        this._createLog = api.createLog;
        this._attachCheckpoint = api.attachCheckpoint;
        this._activationNames = activationNames;
        this._connected = new Promise<boolean>(resolve => {
            this._resolveConnected = resolve;
        });
    }

    activeConfig(): object {
        return ConfigRuntime.mergeActivationConfig(
            this as {activation?: Record<string, unknown>},
            this._activationNames,
        );
    }

    async init(...configs: object[]): Promise<void> {
        this.config = merge(this.activeConfig(), ...configs) as Config<T, C>;
        this.log = this._createLog?.(this.config.logLevel || 'info', {
            ...this.config.log,
            name: this.config.id,
            context: this.config.type ?? 'dispatch',
        });
        const id = this.config.id.replace(/\./g, '-');
        this._queue = new PQueue({concurrency: this.config.concurrency || 100});
        this._register(
            {
                [`${id}.start`]: this.start.bind(this),
                [`${id}.stop`]: this.stop.bind(this),
            },
            'ports',
            this.config.id,
            this.config.pkg,
        );
        this._subscribe(
            {
                [`${id}.drain`]: this.drain.bind(this),
            },
            'ports',
            this.config.id,
            this.config.pkg,
        );
    }

    error(error: ITypedError, $meta: IMeta): void {
        if ((this.log as {error?: (...args: unknown[]) => void})?.error) {
            if (error.type && $meta?.expect?.includes?.(error.type)) return;
            if ($meta) error.method = $meta.method;
            (this.log as {error: (...args: unknown[]) => void}).error(error);
        }
    }

    findValidation(): unknown {
        return null;
    }

    handles(name: string): boolean {
        if (reserved.includes(name)) return true;
        const id = this.config.id.replace(/\./g, '-');
        return ([] as (string | RegExp)[])
            .concat(this.config.namespace || this.config.imports || id)
            .some(namespace =>
                typeof namespace === 'string' ? name.startsWith(namespace) : namespace.test(name),
            );
    }

    methodPath(methodName: string): string {
        const afterSlash = methodName.split('/', 2)[1];
        if (afterSlash !== undefined) return afterSlash;
        const strip = this.config?.stripNamespace;
        if (strip) return methodName.split('.').slice(strip).join('.');
        return methodName;
    }

    getConversion($meta: IMeta | false, type: 'send' | 'receive'): {fn: unknown; name: string} {
        let fn;
        let name: string = '';
        if ($meta) {
            if ($meta.method) {
                const path = this._getPath($meta.method);
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
    }

    async dispatch(...args: unknown[]): Promise<unknown> {
        const result = this._dispatch(...args);
        if (!result)
            (this.log as {error?: (...args: unknown[]) => void})?.error?.(
                this.errors['adapter.dispatchFailure']({args}),
            );
        return result;
    }

    async event(event: string, data?: object, mapper?: string): Promise<unknown> {
        (this.log as {info?: (...args: unknown[]) => void})?.info?.({
            $meta: {mtid: 'event', method: `adapter.${event}`},
            ...data,
        });
        const eventHandlers: Array<(...args: unknown[]) => unknown> = [];
        this.importedMap?.forEach(
            imp =>
                Object.prototype.hasOwnProperty.call(imp, event) && eventHandlers.push(imp[event]),
        );
        let result: unknown = data;
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
        return result;
    }

    drain(): void {}

    findHandler(methodName: string): unknown {
        methodName = this._methodId(methodName);
        return this.imported[methodName];
    }

    async request(...params: unknown[]): Promise<unknown> {
        return this._queue!.add(this._portLoop(params, true));
    }

    async publish(...params: unknown[]): Promise<unknown> {
        await this._queue!.add(this._portLoop(params, false));
        return [true, params[params.length - 1]];
    }

    async ready(): Promise<unknown> {
        return this.event('ready');
    }

    forNamespaces<R>(reducer: (prev: R, current: unknown) => R, initial: R): R {
        const id = this.config.id.replace(/\./g, '-');
        return ([] as (string | RegExp)[])
            .concat(this.config.namespace || this.config.imports || id)
            .reduce(reducer.bind(this), initial);
    }

    async start(): Promise<unknown> {
        await this._api.attachHandlers(this as unknown as AdapterHandlerContext, this.config.imports, true);
        const {req, pub} = this.forNamespaces(
            (
                prev: {
                    req: Record<string, (...args: unknown[]) => unknown>;
                    pub: Record<string, (...args: unknown[]) => unknown>;
                },
                next,
            ) => {
                if (typeof next === 'string') {
                    prev.req[`${next}.request`] = this.request.bind(this);
                    prev.pub[`${next}.publish`] = this.publish.bind(this);
                }
                return prev;
            },
            {req: {}, pub: {}},
        );
        this._register(req, 'ports', this.config.id, this.config.pkg);
        this._subscribe(pub, 'ports', this.config.id, this.config.pkg);
        const {context, ...config} = this.config; // eslint-disable-line @typescript-eslint/no-unused-vars
        return this.event('start', {configBase: this.configBase, config});
    }

    async link(
        patterns: (string | RegExp)[] | string | RegExp,
        target: AdapterHandlerContext = {} as unknown as AdapterHandlerContext,
    ): Promise<object | undefined> {
        await this._api.attachHandlers(target, patterns);
        return target.imported;
    }

    async handle(...params: unknown[]): Promise<unknown> {
        const $meta = params && params.length > 1 && (params[params.length - 1] as IMeta);
        if ($meta && typeof $meta === 'object') this._attachCheckpoint?.($meta);
        const method = ($meta && $meta.method) || 'exec';
        const handler = this.findHandler(method) || this.imported['exec'];
        if (handler instanceof Function) {
            return handler.apply(this, params);
        } else {
            throw this.errors['adapter.methodNotFound']({params: {method}});
        }
    }

    connect(what?: net.Socket | (() => void), context?: C): void {
        what ??= this.handle.bind(this);
        context ??= this.config.context;
        this._portLoop = loop(what, this as any, context); // eslint-disable-line @typescript-eslint/no-explicit-any
        this._resolveConnected?.(true);
    }

    async connected(): Promise<boolean> {
        return this._connected;
    }

    async stop(): Promise<unknown> {
        return this.event('stop');
    }
}

/**
 * Create an adapter instance from the API and handler definitions.
 *
 * The `AdapterBase` class is instantiated here (not imported by realms) and
 * placed at the end of the handler prototype chain.  This preserves the
 * constraint that realms/solutions never depend on blong-gogo.
 */
export default async function adapter<T, C extends IContext>(
    api: IApi,
    configBase: string,
    activationNames: string[] = [],
): Promise<Adapter<T, C>> {
    const {adapter: adapterFactory, utError, handlers, remote, rpc, local, registry, type} = api;
    _errors ||= utError.register(errorMap);

    const base = new AdapterBase<T, C>(api, configBase, activationNames);

    const result = handlers!({utError, remote, type});
    let current = result;
    while (current.extends) {
        const parent = await (typeof current.extends === 'string'
            ? adapterFactory(current.extends)!({utError, remote, rpc, local, registry})
            : current.extends({utError, remote, rpc, local, registry}));
        Object.setPrototypeOf(current, parent);
        current = parent;
    }
    Object.setPrototypeOf(current, base);

    return result as Adapter<T, C>;
}
