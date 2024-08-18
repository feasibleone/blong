import type {
    GatewaySchema,
    IAdapterFactory,
    IErrorFactory,
    ILog,
    IRemote,
} from '@feasibleone/blong';
import {Internal} from '@feasibleone/blong';
import {Type} from '@sinclair/typebox';
import PQueue from 'p-queue';
import merge from 'ut-function.merge';

import type {IGateway} from './Gateway.js';
import type {ILocal} from './Local.js';
import type {IResolution} from './Resolution.js';
import type {IRpcServer} from './RpcServer.js';
import type {IWatch} from './Watch.js';
import {methodId, methodParts} from './lib.js';

type Handlers = ((params: {
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
    connected: () => Promise<boolean>;
}

type MatchMethodsCallback = (name: string, local: object, literals: object[]) => void;
const API: RegExp = /\.validation$|\.api$|^validation$|^api$/;

export default class Registry extends Internal implements IRegistry {
    public modules: Map<string | symbol, IRegistry[]> = new Map();
    public ports: Map<string, IAdapterFactory> = new Map();
    public methods: Map<string, Handlers> = new Map();
    #reload: PQueue = new PQueue({concurrency: 1});
    #ports: Map<string, ReturnType<IAdapterFactory>> = new Map();
    #error: IErrorFactory;
    #portAttachments: Map<
        string,
        [
            {
                port: object;
                target: {importedMap: Map<string, object>};
                parent: object;
                pointer: object;
            }
        ]
    > = new Map();
    #validations: Record<string, GatewaySchema> = {};

    #resolution: IResolution;
    #rpcServer: IRpcServer;
    #remote: IRemote;
    #gateway: IGateway;
    #local: ILocal;
    #watch: IWatch;
    #log: ILog;

    public constructor(
        config: object,
        {
            log,
            error,
            rpcServer,
            remote,
            gateway,
            local,
            resolution,
            watch,
        }: {
            log?: ILog;
            error?: IErrorFactory;
            rpcServer?: IRpcServer;
            remote?: IRemote;
            gateway?: IGateway;
            local?: ILocal;
            resolution?: IResolution;
            watch?: IWatch;
        }
    ) {
        super();
        this.#resolution = resolution;
        this.#rpcServer = rpcServer;
        this.#error = error;
        this.#remote = remote;
        this.#gateway = gateway;
        this.#local = local;
        this.#log = log;
        this.#watch = watch;
    }

    public async createPort(id: string): Promise<ReturnType<IAdapterFactory>> {
        const port = this.ports.get(id);
        await this.#ports.get(id)?.stop();
        if (port.config === false) {
            this.#ports.delete(id);
            return;
        }
        const api: Parameters<IAdapterFactory>[0] = {
            id,
            adapter: id => this.ports.get(id),
            utError: {
                register: this.#error.register.bind(this.#error),
                defineError: this.#error.define.bind(this.#error),
                getError: this.#error.get.bind(this.#error),
                fetchErrors: this.#error.fetch.bind(this.#error),
            },
            errors: this.#error,
            gateway: this.#gateway,
            remote: this.#remote,
            utBus: {
                config: {},
                methodId,
                register: (methods, namespace, port, pkg) => {
                    this.#rpcServer?.register(methods, namespace, true, pkg);
                    this.#local?.register(methods, namespace, true, pkg);
                },
                unregister: (methods, namespace) => {
                    this.#rpcServer?.unregister(methods, namespace, true);
                    this.#local?.unregister(methods, namespace);
                },
                subscribe: (methods, namespace, port, pkg) => {
                    this.#rpcServer?.register(methods, namespace, false, pkg);
                    this.#local?.register(methods, namespace, false, pkg);
                },
                unsubscribe: (methods, namespace) => {
                    this.#rpcServer?.unregister(methods, namespace, false);
                    this.#local?.unregister(methods, namespace);
                },
                getPath(method: string) {
                    return method.match(/^[^[#?]*/)[0];
                },
                importMethod: (methodName, options) => this.#remote.remote(methodName, options),
                dispatch: (...params) => this.#remote.dispatch(...params),
                attachHandlers: undefined,
            },
            utLog: {
                createLog: (level, bindings) => this.#log?.logger(level, bindings) || {},
            },
        };
        const result = await port(api);
        this.#ports.set(id, result);
        api.utBus.attachHandlers = this._attachHandlers(result);
        return result;
    }

    private async _matchMethods(
        mode: 'extend' | 'merge',
        patterns: (string | RegExp)[] | string | RegExp,
        port: object | MatchMethodsCallback,
        callback?: MatchMethodsCallback
    ): Promise<void> {
        if (typeof port === 'function' && !callback) {
            callback = port as MatchMethodsCallback;
            port = undefined;
        }
        for (const [name, value] of this.methods.entries()) {
            if (
                []
                    .concat(patterns)
                    .some(
                        pattern =>
                            (pattern instanceof RegExp && pattern.test(name)) || pattern === name
                    )
            ) {
                if (mode === 'merge') {
                    for (const item of value) {
                        const {local, literals} = await this._createHandlers([item], port);
                        callback(name, local, literals);
                    }
                } else {
                    const {local, literals} = await this._createHandlers(value, port);
                    callback(name, local, literals);
                }
            }
        }
    }

    private async _validations(): Promise<Record<string, GatewaySchema>> {
        await this._matchMethods('merge', API, (name, local, literals) => {
            Object.entries(local).forEach(([name, validation]) => {
                const schema =
                    typeof validation === 'function'
                        ? (validation as () => GatewaySchema)()
                        : typeof validation === 'object'
                        ? validation
                        : {};
                if (typeof validation === 'function') name = validation.name;
                const prev = this.#validations[methodParts(name)];
                if (prev) merge(prev, schema);
                else this.#validations[methodParts(name)] = schema;
            });
        });
        return this.#validations;
    }

    private _attachHandlers(port: object): (target: object, patterns: unknown) => unknown {
        return (
            target: {importedMap: Map<string, object>; imported: object},
            patterns: (string | RegExp)[] | string | RegExp
        ) => {
            target.imported = {};
            Object.setPrototypeOf(target.imported, target);
            if (patterns && (!Array.isArray(patterns) || patterns.length)) {
                target.importedMap = new Map(); // preserve patterns order
                return this._matchMethods('extend', patterns, port, (name, local, literals) => {
                    const ports = this.#portAttachments.get(name);
                    const info = {port, target, parent: target.imported, pointer: {}};
                    if (ports) ports.push(info);
                    else this.#portAttachments.set(name, [info]);
                    target.importedMap.set(name, local);
                    literals.forEach(literal => Object.setPrototypeOf(literal, target.imported));
                    Object.setPrototypeOf(local, info.parent);
                    Object.setPrototypeOf(info.pointer, local);
                    target.imported = info.pointer;
                });
            }
        };
    }

    public async replaceHandlers(id: string, handlers: Handlers): Promise<void> {
        const attachments = this.#portAttachments.get(id);
        if (attachments) {
            for (const {port, target, parent, pointer} of attachments) {
                const {local, literals} = await this._createHandlers(handlers, port);
                target.importedMap.set(id, local);
                literals.forEach(literal => Object.setPrototypeOf(literal, parent));
                Object.setPrototypeOf(local, parent);
                Object.setPrototypeOf(pointer, local);
            }
        }
        if (API.test(id)) {
            await this.#reload.add(async () => {
                this.methods.set(id, handlers);
                this.#validations = {};
                this.#gateway?.route(await this._validations(), {name: '', version: ''});
                await this.#gateway?.start();
            });
        }
    }

    private async _createHandlers(
        handlers: Handlers,
        port: object
    ): Promise<{local: object; literals: object[]}> {
        const lib = {
            type: Type,
            error: this.#error.register.bind(this.#error),
            merge,
            rename: (object: object, value: string) =>
                Object.defineProperty<unknown>(object, 'name', {value}),
        };
        const local = {};
        const literals = [];
        for (const fn of handlers) {
            await fn({
                lib,
                local,
                literals,
                gateway: this.#gateway,
                remote: name => this.#remote.remote(methodParts(name)),
                port,
            });
        }
        return {local, literals};
    }

    public async start(): Promise<void> {
        for (const id of Array.from(this.ports.keys())) await this.createPort(id);
        for (const port of this.#ports.values()) await port.start();
        for (const port of this.#ports.values()) await port.ready();
        this.#gateway?.route(await this._validations(), {name: '', version: ''});
        await this.#resolution?.start();
        await this.#rpcServer?.start();
        await this.#remote?.start();
        await this.#gateway?.start();
        await this.#watch?.start(this, this.#remote);
        // console.dir(this.ports.entries());
        // console.dir(this.#validations);
        // console.dir(created);
    }

    public async connected(): Promise<boolean> {
        return (
            await Promise.all(
                Array.from(this.#ports.values())
                    .reverse()
                    .map(port => port.connected?.() ?? port.isConnected)
            )
        ).every(item => item);
    }

    public async test(framework: unknown): Promise<void> {
        await this.#watch.test(framework);
    }

    public async stop(): Promise<void> {
        await this.#watch?.stop();
        await this.#gateway?.stop();
        await this.#remote?.stop();
        await this.#rpcServer?.stop();
        await this.#resolution?.stop();
        for (const port of this.#ports.values()) await port.stop();
    }
}
