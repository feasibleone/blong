import type {IAdapterFactory, IAdapterRegistry, ILog, IRegistry} from '@feasibleone/blong/types';

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
        this.#logger = this.#log?.logger(config[platform]?.realm?.logLevel!, {
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
