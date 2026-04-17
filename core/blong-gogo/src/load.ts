import {
    Internal,
    browser as browserFactory,
    kind,
    server as serverFactory,
    type IApiSchema,
    type IConfigRuntime,
    type IErrorFactory,
    type ILog,
    type ILogger,
    type IModuleConfig,
    type IPlatformApi,
    type IRegistry,
    type Kind,
    type Kinds,
    type SolutionFactory,
} from '@feasibleone/blong/types';

import {Type, type TSchema} from 'typebox';
import merge from 'ut-function.merge';
import {methodParts} from './lib.ts';

import layerProxy from './layerProxy.ts';
import RealmImpl, {type IRealm} from './Realm.ts';
import type {IWatch} from './Watch.ts';

const LAYER_FILE = 'layer' as const;

/** Well-known layer folder names and their default activation per kind */
const WELL_KNOWN_LAYERS: Record<string, {server?: object; browser?: object}> = {
    api: {server: {default: true}, browser: {default: true}},
    init: {server: {default: true}, browser: {default: true}},
    'server/init': {server: {default: true}},
    'server/api': {server: {integration: true}},
    'browser/init': {browser: {default: true}},
    'browser/api': {browser: {integration: true}},
    error: {server: {integration: true}},
    sim: {server: {integration: true}},
    adapter: {server: {integration: true}},
    orchestrator: {server: {integration: true}},
    gateway: {server: {integration: true}},
    browser: {server: {integration: true}},
    backend: {browser: {integration: true}},
    component: {browser: {integration: true}},
    action: {browser: {integration: true}},
    actions: {browser: {integration: true}},
    test: {browser: {integration: true}},
    'server/test': {server: {integration: true}},
    'browser/test': {browser: {integration: true}},
};

/**
 * Discover layer folders in a realm directory that are not already listed as children.
 * Returns a map of folderName -> activation config.
 */
async function discoverLayerFolders(
    {existsSync, join}: IPlatformApi,
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
async function discoverRealmTestMethods(
    {existsSync, readdir, join, basename, extname}: IPlatformApi,
    base: string,
): Promise<string[]> {
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
    const files = (await readdir(testDir)).filter(
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

const System: symbol = Symbol('system');

export function system(original: {[key: symbol]: boolean}): void {
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

export default async function loadRealm<T extends TSchema>(
    platformApi: IPlatformApi,
    def: SolutionFactory<T> & {[symbol: Kind]: Kinds},
    name: string,
    parentConfig: object | string,
    configNames: string[],
    api?: {
        platform: IPlatformApi;
        watch?: IWatch;
        apiSchema?: IApiSchema;
        error?: IErrorFactory;
        port?: () => void;
        log?: ILog;
        registry?: IRegistry;
        configRuntime?: IConfigRuntime;
    } & {
        [key: string]: {init?: () => Promise<unknown>};
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
            const realmBase = platformApi.dirname(realmFilePath);
            const realmFileName = platformApi.basename(realmFilePath);
            const realmName = platformApi.basename(realmBase);
            let pkg: {name: string; version: string} = realmMod.pkg || {
                name: realmName,
                version: '0.0.0',
            };
            if (platformApi.createRequire) {
                try {
                    pkg = platformApi.createRequire(realmUrl)('./package.json') as {
                        name: string;
                        version: string;
                    };
                } catch {}
            }
            const testMethods = await discoverRealmTestMethods(platformApi, realmBase);
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
                return loadRealm(platformApi, wrapper as any, name, parentConfig, configNames);
            } else {
                // Server realm — single platform if no browser.ts alongside, else two-platform server half
                const hasBrowser = platformApi.existsSync(
                    platformApi.join(realmBase, 'browser.ts'),
                );
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
                return loadRealm(platformApi, wrapper as any, name, parentConfig, configNames);
            }
        } else {
            throw new Error(`Root realm must be of kind "server" or "browser", got "${defKind}"`);
        }
    }
    const mod = await def({type: Type});
    if (!('pkg' in mod) && platformApi.platform === 'server')
        mod.pkg = platformApi.createRequire?.(mod.url)('./package.json');
    const mergedConfig: {
        name: string;
        pkg: {name: string; version: string};
        children: unknown[];
        url: string;
        base: string;
        server: {
            load: {logLevel: Parameters<ILog['logger']>[0]};
            realm: {logLevel: Parameters<ILog['logger']>[0]};
        };
        browser: {
            load: {logLevel: Parameters<ILog['logger']>[0]};
            realm: {logLevel: Parameters<ILog['logger']>[0]};
        };
        kopi?: {realm?: unknown};
        watch?: {configs?: object};
        configs?: object;
        configNames: string[];
    } & {
        [key: string]: unknown;
    } = {
        name,
        pkg: {name, version: '0.0.0'},
        children: [],
        url: '',
        base: '',
        server: {
            load: {
                logLevel: 'warn' as Parameters<ILog['logger']>[0],
            },
            realm: {
                logLevel: 'warn' as Parameters<ILog['logger']>[0],
            },
        },
        browser: {
            load: {
                logLevel: 'warn' as Parameters<ILog['logger']>[0],
            },
            realm: {
                logLevel: 'warn' as Parameters<ILog['logger']>[0],
            },
        },
        kopi: undefined,
        watch: undefined as {configs?: object} | undefined,
        configs: undefined,
        configNames: [] as string[],
    };
    const loadedConfigs = [];
    let items: IModuleConfig['children'] = [];
    if (!api) {
        api = {
            platform: platformApi,
        };
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
                return rootKind === 'browser' && globalThis.window
                    ? import('./BrowserLog.ts')
                    : import('./Log.ts');
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
            ...(rootKind === 'browser'
                ? [
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
                  ]
                : [
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
    const {loadedConfig, configRuntime} = await platformApi.loadConfig(parentConfig);
    if (loadedConfig) loadedConfigs.push(loadedConfig);

    merge(mergedConfig, ...loadedConfigs.filter(Boolean));
    mergedConfig.configNames = configNames;
    let logger: ILogger | undefined = api?.log?.logger(
        mergedConfig[rootKind === 'browser' ? 'browser' : 'server']?.load?.logLevel,
        {
            name,
            context: `${defKind}`,
        },
    );
    if (typeof parentConfig === 'string' && mergedConfig.watch)
        mergedConfig.watch.configs = mergedConfig.configs;

    // Auto-discover layer folders not already listed in mod.children
    const base = mergedConfig.url.startsWith('file://')
        ? platformApi.dirname(mergedConfig.url.slice(7))
        : platformApi.dirname(mergedConfig.url);
    mergedConfig.base = base;
    const children = Array.isArray(mod.children) ? mod.children : [];
    const extraChildren: (
        | string
        | {
              path: string;
              name: string;
              isFile?: () => Promise<unknown>;
              isDirectory?: Record<string, () => Promise<unknown>>;
          }
    )[] = [];
    if (base && platformApi.platform === 'server') {
        const explicitChildren = new Set(
            children.filter(c => typeof c === 'string').map(c => platformApi.basename(c as string)),
        );
        const discoveredFolders = await discoverLayerFolders(
            platformApi,
            base,
            rootKind,
            explicitChildren,
            configNames,
        );
        for (const [folderName, activation] of discoveredFolders) {
            if (!(folderName in mergedConfig))
                merge(mergedConfig, {[platformApi.basename(folderName)]: activation});
            extraChildren.push(`./${folderName}`);
        }
    }
    if (mod.children && !Array.isArray(mod.children)) {
        const globFolders: Record<string, Record<string, () => Promise<unknown>>> = {};
        Object.entries(mod.children)
            .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
            .forEach(([path, value]) => {
                let segments = path.split('/');
                if (segments[0] === '.') segments.shift();
                if (segments.length >= 2) {
                    if (segments.length === 2) {
                        extraChildren.push({
                            name: segments[0],
                            path,
                            isFile: value,
                        });
                    } else {
                        const target = (globFolders[`${segments[0]}/${segments[1]}`] ||= {});
                        target[segments.join('/')] = value;
                    }
                }
            });
        Object.entries(globFolders).forEach(([path, isDirectory]) => {
            extraChildren.push({
                name: path.split('/')[0],
                path,
                isDirectory,
            });
        });
    }

    let realm: IRealm;
    for (let item of items.concat(children).concat(extraChildren)) {
        if (typeof item === 'string' && platformApi.platform !== 'server') continue;
        const itemName = typeof item === 'string' ? platformApi.basename(item) : item.name;
        const config: Record<string, unknown> = mergedConfig[itemName] as Record<string, unknown>;
        logger?.debug?.(
            {$meta: {mtid: 'event', method: config ? 'child.load' : 'child.skip'}},
            typeof item === 'string' ? item : item.name + '()',
        );
        if (config) {
            if (typeof item === 'string') {
                switch (defKind) {
                    case 'server':
                    case 'browser': {
                        const folderPath = item;
                        const fileName = folderPath.startsWith('.')
                            ? platformApi.join(base, folderPath, `${defKind}.ts`)
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
                                        ? platformApi.dirname(destUrl.slice(7))
                                        : destUrl;
                                    if (
                                        !platformApi.existsSync(
                                            platformApi.join(destUrl, 'package.json'),
                                        )
                                    ) {
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
                        const loaded: unknown[] = [];
                        for (const dirEntry of await platformApi.scan(base, item))
                            loaded.push(
                                await api.watch?.load(
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
            } else if (platformApi.platform === 'browser' && (item.isDirectory || item.isFile)) {
                const loaded: unknown[] = [];
                loaded.push(
                    await api.watch?.load(mergedConfig, item.isDirectory, item.isFile, item.path),
                );
                item = async () => loaded.filter(Boolean);
            }
            const loadedModules = await item();
            for (const module of Array.isArray(loadedModules) ? loadedModules : [loadedModules]) {
                const item = await module;
                const fn = item?.default ?? item;
                if (typeof fn === 'function' && (fn.prototype instanceof Internal || fn[System])) {
                    api[itemName] = new (fn as IConstructor)(config, api);
                    await api[itemName].init?.();
                    if (itemName === 'log')
                        logger = api.log?.logger(
                            mergedConfig[rootKind === 'browser' ? 'browser' : 'server']?.load
                                ?.logLevel,
                            {
                                name,
                                context: `${defKind}`,
                            },
                        );
                } else if (['solution', 'server', 'browser'].includes(kind(fn))) {
                    realm ||= new RealmImpl(mergedConfig, api, rootKind);
                    realm.addModule(
                        itemName,
                        await loadRealm(
                            platformApi,
                            fn,
                            itemName,
                            {[platformApi.platform]: mergedConfig[platformApi.platform], ...config},
                            configNames,
                            api,
                            rootKind,
                        ),
                    );
                } else if (typeof fn === 'function') {
                    realm ||= new RealmImpl(mergedConfig, api, rootKind);
                    realm.addLayer(
                        itemName,
                        fn(
                            layerProxy(
                                api?.error,
                                api?.apiSchema,
                                api?.port,
                                mergedConfig,
                                api?.configRuntime,
                            ),
                        ).result,
                    );
                }
            }
        }
    }
    // Wire ConfigRuntime into Watch so config-file changes trigger in-process
    // reload via ConfigRuntime.reload() instead of restarting the process.
    if (configRuntime) {
        api.configRuntime = configRuntime;
        api?.watch?.setConfigRuntime?.(configRuntime);
    }
    realm ||= new RealmImpl(mergedConfig, api, rootKind);
    if (!api?.registry) throw new Error('Registry not found in loaded modules');
    return api.registry;
}
