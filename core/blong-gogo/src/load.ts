import load from '@feasibleone/blong-config';
import {
    Internal,
    browser as browserFactory,
    kind,
    server as serverFactory,
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
import {basename, dirname, extname, join} from 'path';

import {Type, type TSchema} from 'typebox';
import merge from 'ut-function.merge';
import {methodParts} from './lib.ts';

import type {Dirent} from 'fs';
import ConfigRuntime from './ConfigRuntime.ts';
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
    action: {browser: {default: true}},
    actions: {browser: {default: true}},
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

/**
 * Discover test method names from a realm's test/test/ folder.
 * Imports each handler file with a null proxy to extract method names.
 */
async function discoverRealmTestMethods(base: string): Promise<string[]> {
    const testDir = join(base, 'test', 'test');
    if (!existsSync(testDir)) return [];
    const nullFn: unknown = new Proxy(
        function () {
            return nullFn;
        } as unknown as object,
        {
            get(_, key) {
                if (typeof key === 'symbol') return undefined;
                return nullFn;
            },
            apply() {
                return nullFn;
            },
        },
    );
    const files = (await readdir(testDir, {withFileTypes: true})).filter(
        f => f.isFile() && /\.(ts|mts|js|mjs)$/i.test(f.name) && !f.name.startsWith('~'),
    );
    const methods: string[] = [];
    for (const file of files) {
        const filePath = join(testDir, file.name);
        try {
            const mod = await import(filePath);
            const fn = mod?.default;
            if (typeof fn === 'function') {
                const result = fn({
                    lib: nullFn,
                    handler: nullFn,
                    errors: nullFn,
                    config: {},
                    remote: nullFn,
                    local: nullFn,
                });
                if (result && typeof result === 'object' && !Array.isArray(result)) {
                    for (const key of Object.keys(result)) methods.push(methodParts(key));
                } else {
                    methods.push(methodParts(basename(file.name, extname(file.name))));
                }
            } else {
                methods.push(methodParts(basename(file.name, extname(file.name))));
            }
        } catch {
            methods.push(methodParts(basename(file.name, extname(file.name))));
        }
    }
    return methods;
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
              config: {
                  suite: config,
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
        configRuntime?: ConfigRuntime;
    },
    rootKind?: 'server' | 'browser',
): Promise<IRegistry> {
    const defKind = kind(def);
    if (!rootKind) {
        if (defKind === 'server' || defKind === 'browser') rootKind = defKind;
        else if (defKind === 'solution') {
            // Realm passed directly as root — wrap in a minimal suite for isolated testing
            const realmMod = await def({type: Type});
            const realmUrl = realmMod.url as string;
            const realmFilePath = realmUrl.startsWith('file://') ? realmUrl.slice(7) : realmUrl;
            const realmBase = dirname(realmFilePath);
            const realmFileName = basename(realmFilePath);
            const realmName = basename(realmBase);
            let pkg: {name: string; version: string};
            try {
                pkg = createRequire(realmUrl)('./package.json') as {name: string; version: string};
            } catch {
                pkg = {name: realmName, version: '0.0.0'};
            }
            const testMethods = await discoverRealmTestMethods(realmBase);
            const realmChild = Object.defineProperty(
                async function () {
                    return {default: def};
                },
                'name',
                {value: realmName, configurable: true},
            );
            if (realmFileName.startsWith('browser')) {
                // Browser realm — wrap in a minimal browser suite
                const wrapper = browserFactory((() => ({
                    url: '',
                    pkg,
                    children: [realmChild],
                    config: {
                        default: {remote: {canSkipSocket: true}, [realmName]: {}},
                        integration: {watch: {test: testMethods}},
                    },
                })) as () => any);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return loadRealm(wrapper as any, name, parentConfig, configNames);
            } else {
                // Server realm — single platform if no browser.ts alongside, else two-platform server half
                const hasBrowser = existsSync(join(realmBase, 'browser.ts'));
                const wrapper = serverFactory((() => ({
                    url: '',
                    pkg,
                    children: [realmChild],
                    config: {
                        default: {
                            rpcServer: {port: 0},
                            gateway: {port: hasBrowser ? 8080 : 0},
                            [realmName]: {},
                        },
                        integration: hasBrowser
                            ? {default: {}} // browser side handles watch.test and canSkipSocket
                            : {
                                  default: {},
                                  remote: {canSkipSocket: true},
                                  watch: {test: testMethods},
                              },
                    },
                })) as () => any);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return loadRealm(wrapper as any, name, parentConfig, configNames);
            }
        } else {
            throw new Error(`Root realm must be of kind "server" or "browser", got "${defKind}"`);
        }
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
    // ConfigRuntime is created only at the root call (when no api is provided)
    // and only when parentConfig is a string (suite name) so blong-config can
    // load external files that may change at runtime.
    let configRuntime: ConfigRuntime | undefined;
    if (!api) {
        api = {};
        if (typeof parentConfig === 'string') {
            configRuntime = new ConfigRuntime({config: {suite: parentConfig}});
        }
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
            restFs: {},
        });
        items = [
            function log() {
                return defKind === 'browser' ? import('./BrowserLog.ts') : import('./Log.ts');
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
            ...(defKind === 'browser' ? [
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
            ] : [
                function remote() {
                    return import('./RpcClient.ts');
                },
                function rpcServer() {
                    return import('./RpcServer.ts');
                },
                function gateway() {
                    return import('./Gateway.ts');
                },
                function restFs() {
                    return import('./RestFs.ts');
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
            ]),
        ];
    }
    loadedConfigs.push(...activeConfigs(mod, configNames));
    // Use ConfigRuntime for the external file/env config at the root level so
    // that the runtime can later reload() in-place and diff the new snapshot.
    if (configRuntime) {
        loadedConfigs.push(await configRuntime.load());
    } else {
        loadedConfigs.push(await loadConfig(parentConfig));
    }
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
    // Wire ConfigRuntime into Watch so config-file changes trigger in-process
    // reload via ConfigRuntime.reload() instead of restarting the process.
    if (configRuntime) {
        api.configRuntime = configRuntime;
        api.watch?.setConfigRuntime?.(configRuntime);
    }
    realm ||= new RealmImpl(mergedConfig, api);
    return api.registry;
}
