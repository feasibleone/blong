import type {IAdapterRegistry, ILog, IRegistry} from '@feasibleone/blong/types';

export interface IRealm {
    addModule: (name: string, mod: IRegistry) => void;
    addLayer: (name: string, layer: IRealm) => void;
}

export default class RealmImpl implements IRealm {
    #registry: IRegistry;
    #log: ILog;
    #logger: ReturnType<ILog['logger']>;
    #config: {
        realm?: {logLevel?: Parameters<ILog['logger']>[0]};
        name: string;
        pkg: {name: string; version: string};
    };
    /**
     * The vocabularies this realm has declared, shared by reference with every layer's result.
     *
     * Held on the realm rather than on a layer because a declaration names what the *realm* reports: a
     * port attaches the proxy when it is created, which is after every layer has loaded, so the array
     * it reads has to be the realm's own and still growing (`@@T-718`).
     */
    #vocabulary: object[] = [];

    public constructor(
        config: {
            server: {realm?: {logLevel: Parameters<ILog['logger']>[0]}};
            browser: {realm?: {logLevel: Parameters<ILog['logger']>[0]}};
            name: string;
            pkg: {name: string; version: string};
        },
        {log, registry}: {log?: ILog; registry?: IRegistry},
        platform: 'server' | 'browser',
    ) {
        this.#config = config;
        this.#registry = registry!;
        this.#log = log!;
        this.#logger = this.#log?.logger(config[platform]?.realm?.logLevel ?? 'info', {
            name: config.name,
            context: `${platform}`,
        });
    }

    private _addModuleInternal(name: string | symbol, mod: IRegistry): void {
        let module = this.#registry.modules.get(name);
        if (!module) {
            module = [];
            this.#registry.modules.set(name, module);
        }
        module.push(mod);
    }

    public addModule(name: string | symbol, mod: IRegistry): void {
        this.#logger?.debug?.(
            {$meta: {mtid: 'event', method: 'module.add'}},
            `${this.#config.name}.${String(name)}`,
        );
        this._addModuleInternal(name, mod);
    }

    public addLayer(layerName: string, layer: IRealm): void {
        // this._addModuleInternal(this.#config.name, layer);
        // The realm's vocabulary is one declaration for the whole realm, not one per folder: a realm
        // that writes `lukaot/error.ts` beside its handlers declares names for every port it owns, and
        // the port that answers them is `agent` — a different layer with a folder of its own. Each
        // layer's result is pointed at this realm's *one* array, so a declaration loaded after a port
        // was assembled is still in it when the port attaches, and a handler in any layer reads the
        // same `signal` proxy (`@@T-718`).
        const declared = (layer as {vocabulary?: object[]}).vocabulary;
        if (declared?.length) this.#vocabulary.push(...declared);
        (layer as {vocabulary?: object[]}).vocabulary = this.#vocabulary;
        const source: string[] = [];
        Object.entries(layer).forEach(([itemName, item]) => {
            if (item.source) source.push(item.source);
            const id = `${this.#config.name}.${itemName}`;
            if (typeof item === 'object' && 'port' in item)
                this.#registry.ports.set(id, item.port as unknown as IAdapterRegistry);
            else if (typeof item === 'object' && 'methods' in item) {
                const methods = this.#registry.methods.get(id);
                if (methods) methods.push(...item.methods);
                else this.#registry.methods.set(id, item.methods);
            }
        });
        if (source.length === 1)
            // this.#logger?.debug?.(`Layer ${this.#config.name}.${layerName} ${source[0]}`);
            this.#logger?.debug?.(
                {$meta: {mtid: 'event', method: 'layer.add'}},
                `${this.#config.name}.${layerName} ${source[0]}`,
            );
        else if (!source.length) this.#logger?.debug?.(`Layer ${this.#config.name}.${layerName}`);
        else
            this.#logger?.debug?.(
                {$meta: {mtid: 'event', method: 'layer.add'}},
                `${this.#config.name}.${layerName} ${source}`,
            );
    }
}
