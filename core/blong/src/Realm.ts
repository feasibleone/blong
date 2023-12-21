
import type { Log } from './Log.js';
import type { Registry } from './Registry.js';
import type { adapter } from './adapter.js';

type methodFactory = ((params: {remote: (name: string) => unknown, lib: object, port: object, local: object, literals: object[]}) => void)

export interface Realm {
    addModule: (name: string | symbol, mod: Realm) => void
    addLayer: (name: string | symbol, layer: Realm) => void
}

export default class RealmImpl implements Realm {
    #registry: Registry;
    #log: Log;
    #logger: ReturnType<Log['logger']>;
    #config: {realm?: {logLevel?: Parameters<Log['logger']>[0]}, name: string, pkg: {name: string, version: string}};

    constructor(
        config: {realm?: {logLevel?: Parameters<Log['logger']>[0]}, name: string, pkg: {name: string, version: string}},
        { log, registry }: { log?: Log, registry?: Registry }
    ) {
        this.#config = config;
        this.#registry = registry;
        this.#log = log;
        this.#logger = this.#log?.logger(config.realm?.logLevel, {name: 'realm'});
    }

    private addModuleInternal(name: string | symbol, mod: Realm) {
        let module = this.#registry.modules.get(name);
        if (!module) {
            module = [];
            this.#registry.modules.set(name, module);
        }
        module.push(mod);
    }

    addModule(name: string, mod: Realm) {
        this.#logger?.debug?.(`Module ${this.#config.name}.${name}`);
        this.addModuleInternal(name, mod);
    }

    addLayer(layerName: string, layer: Realm) {
        this.addModuleInternal(this.#config.name, layer);
        const source = [];
        Object.entries(layer).forEach(([itemName, item]) => {
            if (item.source) source.push(item.source);
            const id = `${this.#config.name}.${itemName}`;
            if (typeof item === 'object' && 'port' in item) this.#registry.ports.set(id, item.port as adapter);
            else if (typeof item === 'object' && 'methods' in item) {
                const methods = this.#registry.methods.get(id);
                if (methods) methods.push(...item.methods); else this.#registry.methods.set(id, item.methods as methodFactory[]);
            }
        });
        if (source.length === 1) this.#logger?.debug?.(`Layer ${this.#config.name}.${layerName} ${source[0]}`);
        else if (!source.length) this.#logger?.debug?.(`Layer ${this.#config.name}.${layerName}`);
        else this.#logger?.debug?.({source}, `Layer ${this.#config.name}.${layerName}`);
    }
}
