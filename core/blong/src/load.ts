import { Type } from '@sinclair/typebox';
import { readdir } from 'fs/promises';
import { basename, dirname, join } from 'path';
import { load } from 'ut-config';
import merge from 'ut-function.merge';

import { internal, kind } from '../types.js';
import RealmImpl, { type Realm } from './Realm.js';
import layerProxy from './layerProxy.js';

const scan = async(...path: string[]) => (await readdir(join(...path), {withFileTypes: true})).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);

const System = Symbol('system');
export function system(original, context: ClassDecoratorContext) {
    original[System] = true;
}

type internalConstructor = {
    new(config?: object, api?: object): object
}

function activeConfigs(config: Record<string, unknown>, configNames: string[]) {
    return ['default'].concat(configNames).map(name => config[name]).filter(Boolean).concat({pkg: config.pkg, children: config.children, url: config.url});
}

async function loadConfig(config: string | object) {
    return typeof config === 'string' ? load({
        implementation: config,
        resolve: import.meta.resolve,
        config: {}
    }) : config;
}

export default async function loadRealm(def, name: string, parentConfig: object | string, configNames: string[], api?) {
    const defKind = kind(def);
    def = await def({Type});
    const mergedConfig = {name, pkg: {name, version: '0.0'}, children: [], url: '', watch: undefined, configs: undefined};
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
            remote: {},
            local: {},
            rpcServer: {},
            gateway: {}
        });
        items = [
            function log() { return import('./Log.js'); },
            function port() { return import('./Port.js'); },
            function error() { return import('./ErrorFactory.js'); },
            function watch() { return import('./Watch.js'); },
            function local() { return import('./Local.js'); },
            function resolution() { return import('./ResolutionLocal.js'); },
            ...{
                server: [
                    function remote() { return import('./RpcClient.js'); },
                    function rpcServer() { return import('./RpcServer.js'); },
                    function gateway() { return import('./Gateway.js'); },
                    function registry() { return import('./Registry.js'); },
                    function codec() { return import('./codec/browser.js'); },
                    function adapter() { return import('./adapter/server.js'); }
                ],
                browser: [
                    function remote() { return import('./Remote.js'); },
                    function registry() { return import('./Registry.js'); },
                    function codec() { return import('./codec/browser.js'); },
                    function adapter() { return import('./adapter/browser.js'); }
                ]
            }[defKind] ?? []
        ];
    }
    loadedConfigs.push(...activeConfigs(def, configNames));
    loadedConfigs.push(await loadConfig(parentConfig));
    merge(mergedConfig, ...loadedConfigs.filter(Boolean));
    if (typeof parentConfig === 'string' && mergedConfig.watch) mergedConfig.watch.configs = mergedConfig.configs;
    let realm: Realm;
    for (let item of items.concat(def.children)) {
        const itemName = typeof item === 'string' ? basename(item) : item.name;
        const config = (mergedConfig[itemName]);
        if (config) {
            if (typeof item === 'string') {
                const loaded = [];
                const base = mergedConfig.url.startsWith('file:/') ? dirname(mergedConfig.url.slice(5)) : mergedConfig.url;
                for (const dirEntry of await scan(base, item)) loaded.push(await api.watch.load(mergedConfig, dirEntry.isDirectory(), dirEntry.isFile(), base, item, dirEntry.name));
                item = async() => loaded;
            }
            for (const module of [].concat(await item())) {
                const item = await module;
                const fn = (item?.default ?? item);
                if (typeof fn === 'function' && (fn.prototype instanceof internal || fn[System])) {
                    api[itemName] = new (fn as internalConstructor)(config, api);
                    await api[itemName].init?.();
                } else if (['solution', 'server', 'browser'].includes(kind(fn))) {
                    realm ||= new RealmImpl(mergedConfig, api);
                    realm.addModule(itemName, await loadRealm(fn, itemName, config, configNames, api));
                } else if (typeof fn === 'function') {
                    realm ||= new RealmImpl(mergedConfig, api);
                    realm.addLayer(itemName, fn(layerProxy(api.error, api.port, mergedConfig)).result);
                }
            }
        }
    }
    realm ||= new RealmImpl(mergedConfig, api);
    return api.registry;
}
