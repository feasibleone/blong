import {
    Internal,
    kind,
    type IApiSchema,
    type IErrorFactory,
    type ILog,
    type ILogger,
    type IModuleConfig,
    type IRegistry,
    type Kind,
    type Kinds,
    type SolutionFactory,
} from '@feasibleone/blong/types';
import {existsSync} from 'fs';
import {readdir} from 'fs/promises';
import {createRequire} from 'node:module';
import {basename, dirname, join} from 'path';
import {Type, type TSchema} from 'typebox';
import {load} from 'ut-config';
import merge from 'ut-function.merge';

import type {Dirent} from 'fs';
import layerProxy from './layerProxy.ts';
import RealmImpl, {type IRealm} from './Realm.ts';
import type {IWatch} from './Watch.ts';

const LAYER_FILE = 'layer' as const;

/** Well-known layer folder names and their default activation per kind */
const WELL_KNOWN_LAYERS: Record<string, {server?: object; browser?: object}> = {
    init: {server: {default: true}, browser: {default: true}},
    'server/init': {server: {default: true}},
    'browser/init': {browser: {default: true}},
    error: {server: {default: true}},
    sim: {server: {integration: true}},
    adapter: {server: {default: true}},
    orchestrator: {server: {default: true}},
    gateway: {server: {default: true}},
    browser: {server: {default: true}},
    backend: {browser: {default: true}},
    component: {browser: {default: true}},
    test: {browser: {integration: true}},
    'server/test': {server: {integration: true}},
    'browser/test': {browser: {integration: true}},
};

/**
 * Discover layer folders in a realm directory that are not already listed as children.
 * Returns a map of folderName -> activation config.
 */
async function discoverLayerFolders(
    base: string,
    kind_: 'server' | 'browser',
    explicitChildren: Set<string>,
    configNames: string[],
): Promise<[string, object][]> {
    const result: [string, object][] = [];
    for (const name of Object.keys(WELL_KNOWN_LAYERS)) {
        if (explicitChildren.has(name)) continue;
        const layerFolder = join(base, name);
        if (!existsSync(layerFolder)) continue;
        const layerFile = join(base, name, `${LAYER_FILE}.${kind_}.ts`);
        if (existsSync(layerFile)) {
            // Read activation from layer.server.ts / layer.browser.ts
            const mod = await import(layerFile).catch(() => null);
            const activation = mod?.default ?? {default: true};
            result.push([name, activation]);
        } else if (name in WELL_KNOWN_LAYERS && WELL_KNOWN_LAYERS[name][kind_]) {
            result.push([name, WELL_KNOWN_LAYERS[name][kind_]]);
        }
    }
    return result;
}

const scan = async (...path: string[]): Promise<Dirent[]> =>
    (await readdir(join(...path), {withFileTypes: true})).sort((a, b) =>
        a < b ? -1 : a > b ? 1 : 0,
    );
const System: symbol = Symbol('system');

export function system(original: object): void {
    original[System] = true;
}

interface IConstructor {
    new (config?: object, api?: object): object;
}

function activeConfigs<T extends TSchema>(
    mod: IModuleConfig<T>,
    configNames: string[],
): (boolean | object)[] {
    return ['default']
        .concat(configNames)
        .map(name => mod.config?.[name])
        .filter(Boolean)
        .concat({pkg: mod.pkg, children: mod.children, url: mod.url});
}

async function loadConfig(config: string | object): Promise<object> {
    return typeof config === 'string'
        ? load({
              resolve: import.meta.resolve,
              config: {
                  implementation: config,
              },
          })
        : config;
}

export default async function loadRealm<T extends TSchema>(
    def: SolutionFactory<T> & {[symbol: Kind]: Kinds},
    name: string,
    parentConfig: object | string,
    configNames: string[],
    api?: {
        watch?: IWatch;
        apiSchema?: IApiSchema;
        error?: IErrorFactory;
        port?: () => void;
        log?: ILog;
        registry?: IRegistry;
    },
    rootKind?: 'server' | 'browser',
): Promise<IRegistry> {
    const defKind = kind(def);
    if (!rootKind) {
        if (defKind === 'server' || defKind === 'browser') rootKind = defKind;
        else throw new Error(`Root realm must be of kind "server" or "browser", got "${defKind}"`);
    }
    const mod = await def({type: Type});
    if (!('pkg' in mod)) mod.pkg = createRequire(mod.url)('./package.json');
    const mergedConfig = {
        name,
        pkg: {name, version: '0.0'},
        children: [],
        url: '',
        base: '',
        load: undefined,
        kopi: undefined,
        watch: undefined,
        configs: undefined,
        configNames: [] as string[],
    };
    const loadedConfigs = [];
    let items = [];
    if (!api) {
        api = {};
        loadedConfigs.push({
            watch: {},
            log: {},
            apiSchema: {},
            error: {},
            registry: {},
            port: {},
            codec: {},
            adapter: {},
            orchestrator: {},
            remote: {},
            local: {},
            rpcServer: {},
            gateway: {},
        });
        items = [
            function log() {
                return import('./Log.ts');
            },
            function apiSchema() {
                return import('./ApiSchema.ts');
            },
            function port() {
                return import('./Port.ts');
            },
            function error() {
                return import('./ErrorFactory.ts');
            },
            function watch() {
                return import('./Watch.ts');
            },
            function local() {
                return import('./Local.ts');
            },
            function resolution() {
                return import('./ResolutionLocal.ts');
            },
            ...({
                server: [
                    function remote() {
                        return import('./RpcClient.ts');
                    },
                    function rpcServer() {
                        return import('./RpcServer.ts');
                    },
                    function gateway() {
                        return import('./Gateway.ts');
                    },
                    function registry() {
                        return import('./Registry.ts');
                    },
                    function codec() {
                        return import('./codec/server.ts');
                    },
                    function orchestrator() {
                        return import('./orchestrator/index.ts');
                    },
                    function adapter() {
                        return import('./adapter/server.ts');
                    },
                ],
                browser: [
                    function remote() {
                        return import('./Remote.ts');
                    },
                    function registry() {
                        return import('./Registry.ts');
                    },
                    function codec() {
                        return import('./codec/browser.ts');
                    },
                    function orchestrator() {
                        return import('./orchestrator/index.ts');
                    },
                    function adapter() {
                        return import('./adapter/browser.ts');
                    },
                ],
            }[defKind] ?? []),
        ];
    }
    loadedConfigs.push(...activeConfigs(mod, configNames));
    loadedConfigs.push(await loadConfig(parentConfig));
    merge(mergedConfig, ...loadedConfigs.filter(Boolean));
    mergedConfig.configNames = configNames;
    let logger: ILogger;
    if (typeof parentConfig === 'string' && mergedConfig.watch)
        mergedConfig.watch.configs = mergedConfig.configs;

    // Auto-discover layer folders not already listed in mod.children
    const base = mergedConfig.url.startsWith('file://')
        ? dirname(mergedConfig.url.slice(7))
        : mergedConfig.url;
    mergedConfig.base = base;
    const extraChildren: string[] = [];
    if (base) {
        const explicitChildren = new Set(
            (mod.children ?? []).filter(c => typeof c === 'string').map(c => basename(c as string)),
        );
        const discoveredFolders = await discoverLayerFolders(
            base,
            rootKind,
            explicitChildren,
            configNames,
        );
        for (const [folderName, activation] of discoveredFolders) {
            if (!(folderName in mergedConfig))
                merge(mergedConfig, {[basename(folderName)]: activation});
            extraChildren.push(`./${folderName}`);
        }
    }

    let realm: IRealm;
    for (let item of items.concat(mod.children ?? []).concat(extraChildren)) {
        const itemName = typeof item === 'string' ? basename(item) : item.name;
        const config = mergedConfig[itemName];
        logger?.debug?.(`Loading ${defKind}/${itemName}`);
        if (config) {
            if (typeof item === 'string') {
                switch (defKind) {
                    case 'server':
                    case 'browser': {
                        const folderPath = item;
                        const fileName = folderPath.startsWith('.')
                            ? join(base, folderPath, `${defKind}.ts`)
                            : folderPath;
                        item = async () => {
                            try {
                                const mod = await import(fileName);
                                return mod.default ?? mod;
                            } catch (error) {
                                if (
                                    !['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND'].includes(
                                        error.code,
                                    )
                                )
                                    throw error;

                                if (mergedConfig?.kopi?.realm) {
                                    let destUrl = import.meta.resolve(fileName);
                                    destUrl = destUrl.startsWith('file://')
                                        ? dirname(destUrl.slice(7))
                                        : destUrl;
                                    if (!existsSync(join(destUrl, 'package.json'))) {
                                        const {createRealm} = await import('./kopi.ts');
                                        await createRealm(destUrl, logger);
                                        const mod = await import(fileName);
                                        return mod.default ?? mod;
                                    }
                                }
                            }
                        };
                        break;
                    }
                    default:
                        const loaded = [];
                        for (const dirEntry of await scan(base, item))
                            loaded.push(
                                await api.watch.load(
                                    mergedConfig,
                                    dirEntry.isDirectory(),
                                    dirEntry.isFile(),
                                    base,
                                    item,
                                    dirEntry.name.toString(),
                                ),
                            );
                        item = async () => loaded.filter(Boolean);
                }
            }
            for (const module of [].concat(await item())) {
                const item = await module;
                const fn = item?.default ?? item;
                if (typeof fn === 'function' && (fn.prototype instanceof Internal || fn[System])) {
                    api[itemName] = new (fn as IConstructor)(config, api);
                    await api[itemName].init?.();
                    if (itemName === 'log')
                        logger = api.log.logger(mergedConfig.load?.logLevel ?? 'warn', {
                            name: 'load',
                        });
                } else if (['solution', 'server', 'browser'].includes(kind(fn))) {
                    realm ||= new RealmImpl(mergedConfig, api);
                    realm.addModule(
                        itemName,
                        await loadRealm(fn, itemName, config, configNames, api, rootKind),
                    );
                } else if (typeof fn === 'function') {
                    realm ||= new RealmImpl(mergedConfig, api);
                    realm.addLayer(
                        itemName,
                        fn(layerProxy(api.error, api.apiSchema, api.port, mergedConfig)).result,
                    );
                }
            }
        }
    }
    realm ||= new RealmImpl(mergedConfig, api);
    return api.registry;
}
