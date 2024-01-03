import { Type } from '@sinclair/typebox';
import merge from 'ut-function.merge';

import type { GatewaySchema } from '../types.js';
import { internal } from '../types.js';
import type { ErrorFactory } from './ErrorFactory.js';
import type { Gateway } from './Gateway.js';
import type { Local } from './Local.js';
import type { Log } from './Log.js';
import type { Remote } from './Remote.js';
import type { Resolution } from './Resolution.js';
import type { RpcServer } from './RpcServer.js';
import type { Watch } from './Watch.js';
import type { adapter } from './adapter.js';
import { methodId, methodParts } from './lib.js';

export interface Registry {
    ports: Map<string, adapter>
    methods: Map<string, ((params: {remote: unknown, lib: object, port: object, local: object, literals: object[]}) => void)[]>
    modules: Map<string | symbol, unknown[]>
    createPort: (id: string) => Promise<ReturnType<adapter>>
    replaceHandlers: (id: string, handlers: object) => Promise<void>;
    connected: () => Promise<boolean>
}

type matchMethodsCallback = (name: string, local: object, literals: object[]) => void
const API = /\.validation|\.api|^validation$|^api$/;

export default class RegistryImpl extends internal implements Registry {
    modules = new Map();
    ports = new Map();
    methods = new Map();
    #ports = new Map<string, ReturnType<adapter>>();
    #error: ErrorFactory;
    #portAttachments = new Map();
    #validations: Record<string, GatewaySchema> = {};

    #resolution: Resolution;
    #rpcServer: RpcServer;
    #remote: Remote;
    #gateway: Gateway;
    #local: Local;
    #watch : Watch;
    #log: Log;

    constructor(
        config,
        {
            log,
            error,
            rpcServer,
            remote,
            gateway,
            local,
            resolution,
            watch
        }: {
            log?: Log,
            error?: ErrorFactory,
            rpcServer?: RpcServer,
            remote?: Remote,
            gateway?: Gateway,
            local?: Local,
            resolution?: Resolution,
            watch?: Watch
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

    async createPort(id: string) {
        const port = this.ports.get(id);
        await this.#ports.get(id)?.stop();
        if (port.config === false) {
            this.#ports.delete(id);
            return;
        }
        const api = {
            id,
            adapter: id => this.ports.get(id),
            utError: {
                register: this.#error.register.bind(this.#error),
                defineError: this.#error.define.bind(this.#error),
                getError: this.#error.get.bind(this.#error),
                fetchErrors: this.#error.fetch.bind(this.#error)
            },
            error: this.#error,
            gateway: this.#gateway,
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
                attachHandlers: undefined
            },
            utLog: {
                createLog: (level, bindings) => this.#log?.logger(level, bindings) || {}
            }
        };
        const result = await port(api);
        this.#ports.set(id, result);
        api.utBus.attachHandlers = this.attachHandlers(result);
        return result;
    }

    private async matchMethods(mode: 'extend' | 'merge', patterns: (string | RegExp)[] | string | RegExp, port: object | matchMethodsCallback, callback?: matchMethodsCallback) {
        if (typeof port === 'function' && !callback) {
            callback = port as matchMethodsCallback;
            port = undefined;
        }
        for (const [name, value] of this.methods.entries()) {
            if ([].concat(patterns).some(pattern => (pattern instanceof RegExp && pattern.test(name)) || (pattern === name))) {
                if (mode === 'merge') {
                    for (const item of value) {
                        const { local, literals } = await this.createHandlers([item], port);
                        callback(name, local, literals);
                    }
                } else {
                    const { local, literals } = await this.createHandlers(value, port);
                    callback(name, local, literals);
                }
            }
        }
    }

    async validations() {
        await this.matchMethods('merge', API, (name, local, literals) => {
            Object.entries(local).forEach(([name, validation]) => {
                if (typeof validation === 'function') {
                    const schema = (validation as () => GatewaySchema)();
                    const prev = this.#validations[methodParts(validation.name)];
                    if (prev) merge(prev, schema); else this.#validations[methodParts(validation.name)] = schema;
                }
            });
        });
        return this.#validations;
    }

    attachHandlers(port: object) {
        return (target: {importedMap: Map<string, object>, imported: object}, patterns: (string | RegExp)[] | string | RegExp) => {
            target.imported = {};
            Object.setPrototypeOf(target.imported, target);
            if (patterns && (!Array.isArray(patterns) || patterns.length)) {
                target.importedMap = new Map(); // preserve patterns order
                return this.matchMethods('extend', patterns, port, (name, local, literals) => {
                    const ports = this.#portAttachments.get(name);
                    const info = {port, target, parent: target.imported, pointer: {}};
                    if (ports) ports.push(info); else this.#portAttachments.set(name, [info]);
                    target.importedMap.set(name, local);
                    literals.forEach(literal => Object.setPrototypeOf(literal, target.imported));
                    Object.setPrototypeOf(local, info.parent);
                    Object.setPrototypeOf(info.pointer, local);
                    target.imported = info.pointer;
                });
            }
        };
    }

    async replaceHandlers(id, handlers) {
        const attachments = this.#portAttachments.get(id);
        if (attachments) {
            for (const {port, target, parent, pointer} of attachments) {
                const { local, literals } = await this.createHandlers(handlers, port);
                target.importedMap.set(id, local);
                literals.forEach(literal => Object.setPrototypeOf(literal, parent));
                Object.setPrototypeOf(local, parent);
                Object.setPrototypeOf(pointer, local);
            }
        }
        if (API.test(id)) {
            this.methods.set(id, handlers);
            await this.validations();
        }
    }

    private async createHandlers(handlers, port) {
        const lib = {
            Type,
            error: this.#error.register.bind(this.#error),
            merge
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
                port
            });
        }
        return { local, literals };
    }

    async start() {
        for (const id of Array.from(this.ports.keys())) await this.createPort(id);
        for (const port of this.#ports.values()) await port.start();
        for (const port of this.#ports.values()) await port.ready();
        this.#gateway?.route(await this.validations(), {name: '', version: ''});
        await this.#resolution?.start();
        await this.#rpcServer?.start();
        await this.#remote?.start();
        await this.#gateway?.start();
        await this.#watch?.start(this, this.#remote);
        // console.dir(this.ports.entries());
        // console.dir(this.#validations);
        // console.dir(created);
    }

    async connected() {
        return (await Promise.all(Array.from(this.#ports.values()).reverse().map(port => port.connected?.() ?? port.isConnected))).every(item => item);
    }

    async test(framework) {
        await this.#watch.test(framework);
    }

    async stop() {
        await this.#watch?.stop();
        await this.#gateway?.stop();
        await this.#remote?.stop();
        await this.#rpcServer?.stop();
        await this.#resolution?.stop();
        for (const port of this.#ports.values()) await port.stop();
    }
}
