import {
    Internal,
    kind,
    type IErrorFactory,
    type ILog,
    type IModuleConfig,
    type SolutionFactory,
} from '@feasibleone/blong';
import {Type} from '@sinclair/typebox';
import {readdir} from 'fs/promises';
import {createRequire} from 'node:module';
import {basename, dirname, join} from 'path';
import {load} from 'ut-config';
import merge from 'ut-function.merge';

import RealmImpl, {type IRealm} from './Realm.js';
import type {IRegistry} from './Registry.js';
import type {IWatch} from './Watch.js';
import layerProxy from './layerProxy.js';

const scan = async (...path: string[]): ReturnType<typeof readdir> =>
    (await readdir(join(...path), {withFileTypes: true})).sort((a, b) =>
        a < b ? -1 : a > b ? 1 : 0
    );
const System: symbol = Symbol('system');

export function system(original: object): void {
    original[System] = true;
}

interface IConstructor {
    new (config?: object, api?: object): object;
}

function activeConfigs(mod: IModuleConfig, configNames: string[]): (boolean | object)[] {
    return ['default']
        .concat(configNames)
        .map(name => mod.config?.[name])
        .filter(Boolean)
        .concat({pkg: mod.pkg, children: mod.children, url: mod.url});
}

async function loadConfig(config: string | object): Promise<object> {
    return typeof config === 'string'
        ? load({
              implementation: config,
              resolve: import.meta.resolve,
              config: {},
          })
        : config;
}

export default async function loadRealm(
    def: SolutionFactory,
    name: string,
    parentConfig: object | string,
    configNames: string[],
    api?: {
        watch?: IWatch;
        error?: IErrorFactory;
        port?: () => void;
        log?: ILog;
        registry?: IRegistry;
    }
): Promise<IRegistry> {
    const defKind = kind(def);
    const mod = await def({type: Type});
    if (!('pkg' in mod)) mod.pkg = createRequire(mod.url)('./package.json');
    const mergedConfig = {
        name,
        pkg: {name, version: '0.0'},
        children: [],
        url: '',
        watch: undefined,
        configs: undefined,
    };
    const loadedConfigs = [];
    let items = [];
    if (!api) {
        api = {};
        loadedConfigs.push({
            watch: {},
            log: {},
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
                return import('./Log.js');
            },
            function port() {
                return import('./Port.js');
            },
            function error() {
                return import('./ErrorFactory.js');
            },
            function watch() {
                return import('./Watch.js');
            },
            function local() {
                return import('./Local.js');
            },
            function resolution() {
                return import('./ResolutionLocal.js');
            },
            ...({
                server: [
                    function remote() {
                        return import('./RpcClient.js');
                    },
                    function rpcServer() {
                        return import('./RpcServer.js');
                    },
                    function gateway() {
                        return import('./Gateway.js');
                    },
                    function registry() {
                        return import('./Registry.js');
                    },
                    function codec() {
                        return import('./codec/server.js');
                    },
                    function orchestrator() {
                        return import('./orchestrator/index.js');
                    },
                    function adapter() {
                        return import('./adapter/server.js');
                    },
                ],
                browser: [
                    function remote() {
                        return import('./Remote.js');
                    },
                    function registry() {
                        return import('./Registry.js');
                    },
                    function codec() {
                        return import('./codec/browser.js');
                    },
                    function orchestrator() {
                        return import('./orchestrator/index.js');
                    },
                    function adapter() {
                        return import('./adapter/browser.js');
                    },
                ],
            }[defKind] ?? []),
        ];
    }
    loadedConfigs.push(...activeConfigs(mod, configNames));
    loadedConfigs.push(await loadConfig(parentConfig));
    merge(mergedConfig, ...loadedConfigs.filter(Boolean));
    if (typeof parentConfig === 'string' && mergedConfig.watch)
        mergedConfig.watch.configs = mergedConfig.configs;
    let realm: IRealm;
    for (let item of items.concat(mod.children)) {
        const itemName = typeof item === 'string' ? basename(item) : item.name;
        const config = mergedConfig[itemName];
        if (config) {
            if (typeof item === 'string') {
                const base = mergedConfig.url.startsWith('file:/')
                    ? dirname(mergedConfig.url.slice(5))
                    : mergedConfig.url;
                switch (defKind) {
                    case 'server':
                    case 'browser':
                        const fileName = item.startsWith('.')
                            ? join(base, item, `${defKind}.js`)
                            : item;
                        item = async () => {
                            const mod = await import(fileName);
                            return mod.default ?? mod;
                        };
                        break;
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
                                    dirEntry.name
                                )
                            );
                        item = async () => loaded;
                }
            }
            for (const module of [].concat(await item())) {
                const item = await module;
                const fn = item?.default ?? item;
                if (typeof fn === 'function' && (fn.prototype instanceof Internal || fn[System])) {
                    api[itemName] = new (fn as IConstructor)(config, api);
                    await api[itemName].init?.();
                } else if (['solution', 'server', 'browser'].includes(kind(fn))) {
                    realm ||= new RealmImpl(mergedConfig, api);
                    realm.addModule(
                        itemName,
                        await loadRealm(fn, itemName, config, configNames, api)
                    );
                } else if (typeof fn === 'function') {
                    realm ||= new RealmImpl(mergedConfig, api);
                    realm.addLayer(
                        itemName,
                        fn(layerProxy(api.error, api.port, mergedConfig)).result
                    );
                }
            }
        }
    }
    realm ||= new RealmImpl(mergedConfig, api);
    return api.registry;
}
