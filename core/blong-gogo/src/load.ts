import {
    Internal,
    browser as browserFactory,
    kind,
    orchestrator,
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

/**
 * An infrastructure item declaration with explicit dependencies.
 * Items are topologically sorted before instantiation so that each item's
 * dependencies are guaranteed to be available when it is created.
 */
interface InfraItem {
    /** Infrastructure item name (becomes the key in the `api` object). */
    name: string;
    /** Names of other infrastructure items this one depends on. */
    deps: string[];
    /** Factory that returns the module (via dynamic import). */
    load: () => Promise<unknown>;
}

/**
 * Topological sort of infrastructure items by their declared dependencies.
 * Throws if a cycle is detected.
 */
function topoSort(items: InfraItem[]): InfraItem[] {
    const byName = new Map(items.map(item => [item.name, item]));
    const sorted: InfraItem[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    function visit(item: InfraItem): void {
        if (visited.has(item.name)) return;
        if (visiting.has(item.name))
            throw new Error(`Circular infrastructure dependency: ${item.name}`);
        visiting.add(item.name);
        for (const dep of item.deps) {
            const depItem = byName.get(dep);
            if (depItem) visit(depItem);
        }
        visiting.delete(item.name);
        visited.add(item.name);
        sorted.push(item);
    }

    for (const item of items) visit(item);
    return sorted;
}

/** Well-known layer folder names and their default activation per kind */
const WELL_KNOWN_LAYERS: Record<string, {server?: object; browser?: object}> = {
    api: {server: {default: true}, browser: {default: true}},
    init: {server: {default: true}, browser: {default: true}},
    meta: {server: {default: true}, browser: {default: true}},
    error: {server: {integration: true}},
    sim: {server: {integration: true}},
    adapter: {server: {integration: true}},
    orchestrator: {server: {integration: true}},
    gateway: {server: {integration: true}},
    backend: {browser: {integration: true}},
    component: {browser: {integration: true}},
    action: {browser: {integration: true}},
    actions: {browser: {integration: true}},
    test: {browser: {integration: true}},
    'server/api': {server: {integration: true}},
    'server/init': {server: {default: true}},
    'server/test': {server: {integration: true}},
    'browser/api': {browser: {integration: true}},
    'browser/init': {browser: {default: true}},
    'browser/test': {browser: {integration: true}},
    'browser/orchestrator': {browser: {integration: true}},
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
): Promise<[string, object][]> {
    const result: [string, object][] = [];
    for (const name of Object.keys(WELL_KNOWN_LAYERS)) {
        if (explicitChildren.has(name)) continue;
        const layerFolder = join(base, name);
        if (!existsSync(layerFolder)) continue;
        const layerFile = join(base, name, `${LAYER_FILE}.${kind_}.ts`);
        if (existsSync(layerFile)) {
            // Read activation from layer.server.ts / layer.browser.ts
            const mod = await import(/* @vite-ignore */ layerFile).catch(() => null);
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
            const mod = await import(/* @vite-ignore */ filePath);
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
    platformConfigs: string[],
): (boolean | object)[] {
    return (
        (['default'] as string[])
            .concat(configNames)
            .concat(platformConfigs)
            .map(name => (mod.config as unknown as Record<string, unknown>)?.[name])
            .filter(Boolean) as (boolean | object)[]
    ).concat({pkg: mod.pkg, children: mod.children, url: mod.url});
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
                        default: {[realmName]: {}},
                        integration: {watch: {test: testMethods}},
                    },
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                })) as () => any);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return loadRealm(platformApi, wrapper as any, name, parentConfig, configNames);
            } else {
                // Server realm — single platform if no browser.ts alongside, else two-platform server half
                const hasBrowser = platformApi.existsSync(
                    platformApi.join(realmBase, 'browser.ts'),
                );
                const wrapper = serverFactory(() => ({
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
                            ? {default: {}} // browser side handles watch.test;
                            : {
                                  default: {},
                                  watch: {test: testMethods},
                              },
                    },
                }));
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
    const loadedConfigs = [];
    let items:
        | IModuleConfig['children']
        | {
              path: string;
              name: string;
              isFile?: () => Promise<unknown>;
              isDirectory?: Record<string, () => Promise<unknown>>;
          }[] = [];
    if (!api) {
        api = {
            platform: platformApi,
        } as unknown as typeof api;
        loadedConfigs.push(
            ...activeConfigs(
                {
                    url: '',
                    config: {
                        default: {
                            watch: {
                                test: [],
                            },
                            log: {},
                            apiSchema: {},
                            error: {},
                            registry: {},
                            port: {},
                            codec: {},
                            adapter: {},
                            orchestrator: {},
                            remote: {
                                canSkipSocket: rootKind === 'browser',
                            },
                            local: {},
                            rpcServer: {},
                            gateway: {},
                            restFs: {},
                            systemDebug: {},
                        },
                        dev: {
                            resolution: true,
                            gateway: {
                                // Static development keys, so sessions survive server hot-reloads
                                /* cSpell:disable */
                                sign: {
                                    kty: 'EC',
                                    crv: 'P-384',
                                    alg: 'ES384',
                                    use: 'sig',
                                    x: 'VlRkjgqRHJSk9WN8CaAqHn34BUMy9pgKQUAAW9MrOqh0yvCmJW7JTr6LUCbm9zfW',
                                    y: '8eYxbAZrv-HZEc4LSgdEHeSp21zO3D8KrynMcVcNAmZKTf3RMkbkh1B26lePHQNz',
                                    d: 'aj6BkYmpwkKRbmcO1LO6d__HX5bvkqcRjqadlX7plXlGfj1d42XiSUWa4c9xrxwt',
                                },
                                encrypt: {
                                    kty: 'EC',
                                    crv: 'P-384',
                                    alg: 'ECDH-ES+A256KW',
                                    use: 'enc',
                                    x: '86IBoWsatO3Vky9CRMxmuYcfYoTY1Yr0D1sJGDgLlREMjbL9cIOHcBQnEaW52QJV',
                                    y: 'fsKOmTuXaIRFXXteh7uU0Z8mncX4VsPhqaz9pMKMm8EktQlF7HBS_fYFdkLwqMMN',
                                    d: 'rBY50TZzjONw_oYzWPqaR3DdoFwO-F9sWcmkOltrJHYnfbnTojNImX2xN1DhhC5-',
                                },
                                /* cSpell:enable */
                            },
                        },
                        integration: {
                            remote: {canSkipSocket: true},
                            gateway: {
                                debug: true,
                                expectedErrors: true,
                            },
                        },
                    },
                },
                configNames,
                platformApi.configs,
            ),
        );
        items = topoSort([
            {
                name: 'log',
                deps: [],
                load: () =>
                    rootKind === 'browser' && globalThis.window
                        ? import('./BrowserLog.ts')
                        : import('./Log.ts'),
            },
            {
                name: 'apiSchema',
                deps: ['log'],
                load: () => import('./ApiSchema.ts'),
            },
            {
                name: 'port',
                deps: ['log'],
                load: () => import('./Port.ts'),
            },
            {
                name: 'error',
                deps: ['log'],
                load: () => import('./ErrorFactory.ts'),
            },
            {
                name: 'watch',
                deps: ['log'],
                load: () => import('./Watch.ts'),
            },
            {
                name: 'local',
                deps: ['log'],
                load: () => import('./Local.ts'),
            },
            {
                name: 'resolution',
                deps: ['log'],
                load: () => import('./ResolutionLocal.ts'),
            },
            ...(rootKind === 'browser'
                ? [
                      {
                          name: 'remote',
                          deps: ['log', 'local'],
                          load: () => import('./Remote.ts'),
                      },
                      {
                          name: 'registry',
                          deps: ['log', 'error', 'remote', 'local', 'watch', 'apiSchema'],
                          load: () => import('./Registry.ts'),
                      },
                      {
                          name: 'codec',
                          deps: ['log'],
                          load: () => import('./codec/browser.ts'),
                      },
                      {
                          name: 'orchestrator',
                          deps: ['log'],
                          load: () => import('./orchestrator/index.ts'),
                      },
                      {
                          name: 'adapter',
                          deps: ['log'],
                          load: () => import('./adapter/browser.ts'),
                      },
                  ]
                : [
                      {
                          name: 'remote',
                          deps: ['log', 'local'],
                          load: () => import('./RpcClient.ts'),
                      },
                      {
                          name: 'rpcServer',
                          deps: ['log'],
                          load: () => import('./RpcServer.ts'),
                      },
                      {
                          name: 'gateway',
                          deps: ['log'],
                          load: () => import('./Gateway.ts'),
                      },
                      {
                          name: 'restFs',
                          deps: ['log', 'gateway'],
                          load: () => import('./RestFs.ts'),
                      },
                      {
                          name: 'systemDebug',
                          deps: ['log', 'gateway', 'registry', 'rpcServer'],
                          load: () => import('./SystemDebug.ts'),
                      },
                      {
                          name: 'registry',
                          deps: [
                              'log',
                              'error',
                              'remote',
                              'rpcServer',
                              'gateway',
                              'local',
                              'watch',
                              'apiSchema',
                          ],
                          load: () => import('./Registry.ts'),
                      },
                      {
                          name: 'codec',
                          deps: ['log'],
                          load: () => import('./codec/server.ts'),
                      },
                      {
                          name: 'orchestrator',
                          deps: ['log'],
                          load: () => import('./orchestrator/index.ts'),
                      },
                      {
                          name: 'adapter',
                          deps: ['log'],
                          load: () => import('./adapter/server.ts'),
                      },
                  ]),
        ]).map(({name, load}) => {
            const fn = load;
            Object.defineProperty(fn, 'name', {value: name});
            return fn;
        });
    }
    loadedConfigs.push(...activeConfigs(mod, configNames, platformApi.configs));
    const {loadedConfig: mergedConfig, configRuntime} = await platformApi.loadConfig(
        {
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
            configNames,
        },
        parentConfig,
        loadedConfigs.filter(Boolean) as object[],
    );

    // Wire ConfigRuntime into Watch so config-file changes trigger in-process
    // reload via ConfigRuntime.reload() instead of restarting the process.
    if (configRuntime) {
        api!.configRuntime = configRuntime;
        api!.watch?.setConfigRuntime?.(configRuntime);
    }
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
    // Use empty base when url is empty (e.g. minimal wrapper) to prevent scanning CWD
    const base = mergedConfig.url
        ? mergedConfig.url.startsWith('file://')
            ? platformApi.dirname(mergedConfig.url.slice(7))
            : platformApi.dirname(mergedConfig.url)
        : '';
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
    if (base && platformApi.platform === 'server' && defKind !== 'server') {
        const explicitChildren = new Set(
            children.filter(c => typeof c === 'string').map(c => platformApi.basename(c as string)),
        );
        const discoveredFolders = await discoverLayerFolders(
            platformApi,
            base,
            rootKind,
            explicitChildren,
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
                const segments = path.split('/');
                if (segments[0] === '.') segments.shift();
                if (segments.length >= 2) {
                    if (segments.length === 2) {
                        extraChildren.push({
                            name: segments[0],
                            path,
                            isFile: value,
                        });
                    } else {
                        const target = (globFolders[platformApi.dirname(segments.join('/'))] ||=
                            {});
                        target[segments.join('/')] = value;
                    }
                }
            });
        Object.entries(globFolders).forEach(([path, isDirectory]) => {
            extraChildren.push({
                name: platformApi.dirname(path),
                path,
                isDirectory,
            });
        });
        for (const child of extraChildren) {
            const folderName = typeof child === 'object' && child.name;
            if (!folderName || folderName in mergedConfig) continue;
            const activation = WELL_KNOWN_LAYERS[folderName]?.[rootKind];
            if (activation) merge(mergedConfig, {[folderName]: activation});
        }
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
                        // Skip import when file doesn't exist — prevents ts-node
                        // ESM resolve-hook errors that can bypass try/catch.
                        if (!platformApi.existsSync(fileName)) {
                            item = async () => [];
                            break;
                        }
                        item = async () => {
                            try {
                                const mod = await import(/* @vite-ignore */ fileName);
                                return mod.default ?? mod;
                            } catch (error) {
                                if (
                                    !['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND'].includes(
                                        (error as {code?: string}).code ?? '',
                                    )
                                )
                                    throw error;

                                if (mergedConfig?.kopi?.realm && !(itemName in WELL_KNOWN_LAYERS)) {
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
                                        const mod = await import(/* @vite-ignore */ fileName);
                                        return mod.default ?? mod;
                                    }
                                }
                                return [];
                            }
                        };
                        break;
                    }
                    default:
                        const loaded: unknown[] = [];
                        for (const dirEntry of await platformApi.scan(base, item))
                            loaded.push(
                                await api!.watch?.load(
                                    mergedConfig,
                                    dirEntry.isDirectory(),
                                    dirEntry.isFile(),
                                    base,
                                    item,
                                    dirEntry.name.toString(),
                                ),
                            );
                        // Auto-provision a testDispatch orchestrator when the test/ folder
                        // has no testDispatch.ts and no layer.server.ts.
                        if (itemName === 'test' && platformApi.platform === 'server' && base) {
                            const testDir = platformApi.join(base, item as string);
                            const hasTestDispatch = platformApi.existsSync(
                                platformApi.join(testDir, 'testDispatch.ts'),
                            );
                            const hasLayerServer = platformApi.existsSync(
                                platformApi.join(testDir, 'layer.server.ts'),
                            );
                            if (!hasTestDispatch && !hasLayerServer) {
                                const realmName = mergedConfig.name;
                                const syntheticOrchestrator = orchestrator(() => ({
                                    extends: 'orchestrator.dispatch' as const,
                                    activation: {
                                        default: {},
                                        integration: {
                                            namespace: ['test'],
                                            imports: [/\.test$/],
                                        },
                                    },
                                }));
                                Object.defineProperty(syntheticOrchestrator, 'name', {
                                    value: 'testDispatch',
                                    configurable: true,
                                });
                                loaded.push(
                                    Object.defineProperty(
                                        (api: unknown) => {
                                            (
                                                api as Record<
                                                    string,
                                                    (...args: unknown[]) => unknown
                                                >
                                            )['testDispatch'](
                                                syntheticOrchestrator,
                                                realmName + '.testDispatch',
                                                'auto-provisioned',
                                            );
                                            return api;
                                        },
                                        'name',
                                        {value: 'testDispatch'},
                                    ),
                                );
                            }
                        }
                        item = async () => loaded.filter(Boolean);
                }
            } else if (platformApi.platform === 'browser' && 'path' in item) {
                const loaded: unknown[] = [];
                loaded.push(
                    await api!.watch?.load(mergedConfig, item.isDirectory, item.isFile, item.path),
                );
                item = async () => loaded.filter(Boolean);
            }
            const loadedModules = await (item as () => Promise<unknown[]>)();
            for (const module of Array.isArray(loadedModules) ? loadedModules : [loadedModules]) {
                const item = await module;
                const fn = (item as {default?: unknown})?.default ?? item;
                if (
                    typeof fn === 'function' &&
                    (fn.prototype instanceof Internal ||
                        (fn as unknown as Record<symbol, unknown>)[System])
                ) {
                    api![itemName] = new (fn as IConstructor)(config, api);
                    await api![itemName].init?.();
                    if (itemName === 'log')
                        logger = api!.log?.logger(
                            mergedConfig[rootKind === 'browser' ? 'browser' : 'server']?.load
                                ?.logLevel,
                            {
                                name,
                                context: `${defKind}`,
                            },
                        );
                } else if (
                    ['solution', 'server', 'browser'].includes(kind(fn as Record<symbol, Kinds>))
                ) {
                    realm ||= new RealmImpl(mergedConfig, api!, rootKind);
                    realm.addModule(
                        itemName,
                        await loadRealm(
                            platformApi,
                            fn as Parameters<typeof loadRealm>[1],
                            itemName,
                            {[platformApi.platform]: mergedConfig[platformApi.platform], ...config},
                            configNames,
                            api,
                            rootKind,
                        ),
                    );
                } else if (typeof fn === 'function') {
                    realm ||= new RealmImpl(mergedConfig, api!, rootKind);
                    realm.addLayer(
                        itemName,
                        fn(
                            layerProxy(
                                api?.error,
                                api?.registry?.objectSchema,
                                api?.apiSchema,
                                api?.port,
                                mergedConfig as unknown as Parameters<typeof layerProxy>[4],
                                api?.configRuntime,
                            ),
                        ).result,
                    );
                }
            }
        }
    }
    realm ||= new RealmImpl(mergedConfig, api!, rootKind);
    if (!api?.registry) throw new Error('Registry not found in loaded modules');
    return api.registry;
}
