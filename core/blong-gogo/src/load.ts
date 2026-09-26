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
    type IManifest,
    type IModuleConfig,
    type IPlatformApi,
    type IRegistry,
    type Kind,
    type Kinds,
    type SolutionFactory,
} from '@feasibleone/blong/types';

import {SLOW_STEP_MS, withProgress} from '@feasibleone/blong-lib';
import {WELL_KNOWN_LAYERS} from '@feasibleone/blong-lib/layers';
import {Type, type TSchema} from 'typebox';
import merge from 'ut-function.merge';
import {methodParts} from './lib.ts';

import {devEncryptKey, devSignKey} from './devKeys.ts';
import layerProxy from './layerProxy.ts';
import RealmImpl, {type IRealm} from './Realm.ts';
import type {IWatch} from './Watch.ts';

/**
 * The extension of the source that is about to be imported — `.ts`, this file's own.
 *
 * Every loader below spells its specifier `import('./Mcp' + extension)`. Written as
 * a literal, the concatenation is folded by the bundler, the specifier gets resolved
 * and the module is bundled: the `@vite-ignore` comment silences the warning but does
 * not stop the resolution. That is how `fastify` and the semantic-log service, or
 * `Gateway`, `RpcServer`, `Mcp` and the rest of the server half of the platform map,
 * ended up in browser builds whose `rootKind` never reaches them. Deriving the value
 * from this module's own url keeps the meaning while leaving those specifiers opaque.
 */
const extension = import.meta.url.endsWith('.ts') ? '.ts' : '.js';

/**
 * A module url as it is compared: the `file://` scheme is not part of a file's
 * identity, and one of the two sides of every comparison (`import.meta.url`) has
 * it while the other (`createRequire().resolve()`) does not.
 */
function normaliseUrl(url: string): string {
    return url.startsWith('file://') ? url.slice(7) : url;
}

const LAYER_FILE = 'layer' as const;

/**
 * Whether the process runs on CI.
 *
 * `load.ts` is shared by both platforms, and `process` does not exist in the
 * browser bundle — a bare `process.env.CI` throws a `ReferenceError` while the
 * browser realm loads (every browser test then fails with "process is not
 * defined"). The optional chain keeps the server behaviour and degrades to
 * `false` in the browser, which is correct: the server platform's `exit` drives
 * the shutdown of both.
 *
 * A function rather than a module constant so the value is read when the config
 * is built, not when the module is first imported.
 */
function isCI(): boolean {
    return Boolean(
        (globalThis as {process?: {env?: Record<string, string | undefined>}}).process?.env?.['CI'],
    );
}

/**
 * Whether stdout is a terminal, in a process that has one.
 *
 * The same reason as {@link isCI}: both platforms build this config block, and
 * `process` does not exist in the browser bundle. Absent, colour is off, which is
 * the right answer there anyway — a browser writes no stdout.
 *
 * It answers for a bare `dev` run, and nothing else: a runtime that pipes this
 * process's stdout can still be watched — Playwright relays the lines it captures
 * back into the terminal — so those runs say so with an intent instead
 * (`playwright`, and `ci` for the captured case), rather than leaving the
 * platform to infer it from a file descriptor.
 */
function isTTY(): boolean {
    return (globalThis as {process?: {stdout?: {isTTY?: boolean}}}).process?.stdout?.isTTY === true;
}

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

/**
 * The margin a step of a load is measured against when the realm names none.
 *
 * Read off the log config (`log.slowMs`) so a realm or a runner can raise it for
 * a machine that is legitimately slow, and so one number tunes both halves of a
 * delayed start: the loader's steps and the retention store's own.
 */
function slowStepMs(log: unknown): number {
    const configured = (log as {slowMs?: unknown} | undefined)?.slowMs;
    return typeof configured === 'number' && configured >= 0 ? configured : SLOW_STEP_MS;
}

/**
 * A logger for the steps that run before the realm's own log exists.
 *
 * A root load builds the log component first, and until it is up there is nothing
 * to log through — which is exactly when a slow step is least visible and most
 * confusing, because the process prints nothing at all for as long as it takes.
 * This writes to stderr, where the framework's other startup messages go, and
 * stays silent in a platform that has no process (the browser bundle). Only
 * `warn` is answered: a step that is not slow has nothing to say, and the
 * loader's ordinary progress belongs in the log the realm is about to have.
 */
function bootstrapLogger(): {warn: (...args: unknown[]) => void} {
    return {
        // Pino-shaped, like every other logger `withProgress` is handed: the
        // details object first, the message second.
        warn: (...args: unknown[]) => {
            const [details, message] = args as [Record<string, unknown> | undefined, string];
            const stderr = (globalThis as {process?: {stderr?: {write: (text: string) => void}}})
                .process?.stderr;
            stderr?.write(`warn  blong ${message} ${JSON.stringify(details ?? {})}\n`);
        },
    };
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

/** A thenable value that can be externally resolved/rejected. */
interface IDeferred<T> {
    then: Promise<T>['then'];
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: unknown) => void;
}

/** Create a thenable with externally callable `resolve` / `reject`. */
function createDeferred<T>(): IDeferred<T> {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return {
        then: promise.then.bind(promise),
        resolve,
        reject,
    };
}

/**
 * Wrap a plain manifest object in a Proxy that automatically creates
 * unresolved {@link IDeferred} values on first read of a missing property,
 * and resolves them on the first write.
 *
 * This lets users pass a plain `{}` to `load()` — properties like
 * `gatewayPort` are auto-provisioned as pending promises when read, and resolved
 * when the server-side component (e.g. Gateway) writes the actual value.
 * Consumers that await the property will transparently wait for the deferred
 * to be settled.
 */
function createManifestProxy(manifest: IManifest): IManifest {
    const pending = new Map<string, IDeferred<unknown>>();
    const OWN_KEYS = new Set<string>();

    return new Proxy(manifest, {
        get(target, prop: string | symbol) {
            if (typeof prop !== 'string') return Reflect.get(target, prop, target);
            if (prop in target) return target[prop];
            if (prop === '__proto__' || prop === 'constructor')
                return Reflect.get(target, prop, target);
            if (!pending.has(prop)) {
                const deferred = createDeferred();
                pending.set(prop, deferred);
                target[prop] = deferred;
                OWN_KEYS.add(prop);
            }
            return target[prop];
        },
        set(target, prop: string | symbol, value) {
            if (typeof prop !== 'string') return Reflect.set(target, prop, value, target);
            // Resolve any pending deferred — either from our own proxy instance
            // or one placed on the target by another proxy instance (when the
            // same manifest object is passed to separate load() calls).
            const existing = pending.get(prop) ?? target[prop];
            if (existing && typeof existing === 'object' && 'resolve' in (existing as object)) {
                (existing as IDeferred<unknown>).resolve(value);
                pending.delete(prop);
            }
            target[prop] = value;
            return true;
        },
        ownKeys(target) {
            return [...Reflect.ownKeys(target), ...OWN_KEYS];
        },
        has(target, prop: string | symbol) {
            if (OWN_KEYS.has(prop as string)) return true;
            return Reflect.has(target, prop);
        },
    });
}

export default async function loadRealm<T extends TSchema>(
    platformApi: IPlatformApi,
    def: SolutionFactory<T> & {[symbol: Kind]: Kinds},
    name: string,
    parentConfig: object | string,
    configNames: string[],
    manifest?: IManifest,
    api?: {
        platform: IPlatformApi;
        watch?: IWatch;
        apiSchema?: IApiSchema;
        error?: IErrorFactory;
        port?: () => void;
        log?: ILog;
        registry?: IRegistry;
        configRuntime?: IConfigRuntime;
        /**
         * The realms this load tree has produced, by the file they came from.
         *
         * Held on the shared `api` so a nested load can record the realm it
         * created, which is the only place the url is readable: a suite's child is
         * the realm *factory*, so the parent's own wrapper finds no `url` on it.
         * Filled for the platform root and inherited by every load beneath it.
         */
        loadedRealmUrls?: Set<string>;
    } & {
        [key: string]: {init?: () => Promise<unknown>};
    },
    rootKind?: 'server' | 'browser',
): Promise<IRegistry> {
    // Wrap the manifest in a proxy that auto-creates Deferred values on first
    // read and resolves them on first write. This lets callers pass a plain
    // object and have properties like `gatewayPort` transparently work as
    // cross-platform synchronization points.
    //
    // A run that supplies no manifest still gets one, because the manifest is also how
    // a component tells **the rest of its own process** something only it can know: the
    // address of the in-process cluster service, which is bound on a port the operating
    // system chooses. Nothing about a caller that omits the object changes — it was
    // `undefined` before, and no component could publish into it.
    manifest = createManifestProxy(manifest ?? {});
    const defKind = kind(def);
    if (!rootKind) {
        if (defKind === 'server' || defKind === 'browser') rootKind = defKind;
        else if (defKind === 'solution') {
            // Realm passed directly as root — wrap in a minimal suite for isolated testing
            const realmMod = await def({type: Type, manifest});
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
                return loadRealm(
                    platformApi,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    wrapper as any,
                    name,
                    parentConfig,
                    configNames,
                    manifest,
                );
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
                return loadRealm(
                    platformApi,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    wrapper as any,
                    name,
                    parentConfig,
                    configNames,
                    manifest,
                );
            }
        } else {
            throw new Error(`Root realm must be of kind "server" or "browser", got "${defKind}"`);
        }
    }
    // Whether this is the platform's own load — captured *before* `api` is assigned
    // below. Read afterwards, the check that gates framework realm auto-inclusion is
    // always false, and every framework realm is silently absent: the gateway then
    // refuses every unauthenticated route (no login realm) and RBAC resolves nothing.
    const isPlatformRoot = api === undefined;
    const bootstrap = bootstrapLogger();
    // A factory may answer with the module or with a promise for it, so the
    // measurement wraps whatever it answered rather than assuming the shape.
    const mod = await withProgress(
        bootstrap,
        `suite ${name}`,
        Promise.resolve(def({type: Type, manifest})),
        {slowMs: SLOW_STEP_MS},
    );
    // Record the realm's own file in the tree's set, so a realm reached twice -
    // once as a suite's child and once by the framework's `frameworkRealms` - is
    // recognised the second time. A realm answers with its *factory*, so its url
    // is readable only here, where the module has been created; the wrapper around
    // a suite's children sees the factory and can read nothing off it (F-194).
    if (typeof (mod as {url?: unknown}).url === 'string') {
        api?.loadedRealmUrls?.add(normaliseUrl((mod as {url?: string}).url as string));
    }
    if (!('pkg' in mod) && platformApi.platform === 'server')
        mod.pkg = platformApi.createRequire?.(mod.url)('./package.json');
    const loadedConfigs = [];
    /**
     * The framework's own intent blocks (`default` + the active intents),
     * resolved once per root load. Kept so their explicit `false` values can be
     * re-asserted after every source has merged.
     */
    let frameworkConfigs: (boolean | object)[] = [];
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
            manifest,
        } as unknown as typeof api;
        // Retained so the "an intent's `false` wins" reconciliation can re-assert
        // these after every source has merged (see below).
        frameworkConfigs = activeConfigs(
            {
                url: '',
                config: {
                    default: {
                        watch: {
                            test: [],
                            /**
                             * Allure reporting for handler tests. Off by default: a report is
                             * something a run is asked for, which is what `--watch.allure.enabled=true`
                             * on the blong CLI does for a dev run and what the `ci` block below does
                             * for a captured one. `blong-allure` is a dependency of this package, so
                             * the CLI that turns the results into HTML is the one they were written
                             * for rather than whatever is on the runner's PATH.
                             *
                             * The results have a directory of their own because a package can report
                             * to Allure from two producers — the browser tests of a realm and its
                             * handler tests — and each clears the directory it writes to before a run.
                             * `blong-dev` merges every producer's directory into the one report a
                             * package publishes.
                             */
                            allure: {
                                enabled: false,
                                outputDir: 'allure-results-tap',
                                historyPath: '.allure/history.jsonl',
                                generateOnEnd: false,
                            },
                        },
                        // The server's log implementation. The browser platform
                        // keeps its own logger regardless: the loader checks the
                        // platform before this key, because the emitter's store is
                        // node-only.
                        log: {impl: 'semantic'},
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
                        mcp: {},
                        apiGateway: {},
                    },
                    dev: {
                        resolution: true,
                        rpcServer: {
                            port: 0,
                        },
                        log: {
                            // The semantic implementation's store, and the pino
                            // implementation's cache beside it: they share one
                            // directory and one key space, so a
                            // `semlog://r/<id>` reference resolves
                            // whichever implementation wrote the entry.
                            cache: {
                                dir: '~/.blong/log-cache',
                                // The framework's own bound, rather than the
                                // emitter's default: a verbose record is tens of
                                // kilobytes, so ten thousand of them is most of a
                                // gigabyte and a slower open for every process in
                                // dev.
                                limit: 5000,
                            },
                            cacache: {
                                cachePath: '~/.blong/log-cache',
                            },
                            // Colour when a human is watching, plain text when the
                            // output is piped or captured, so a terminal keeps the
                            // colours the pino printer used to give it while a test
                            // run stays readable as text.
                            color: isTTY(),
                            // The service that turns the records into templates,
                            // flows and diagrams, run in this process: a
                            // development run can then be drawn from what it just
                            // did, and a test run leaves diagrams behind.
                            //
                            // The port is asked for, never named. Two framework
                            // processes on one machine are ordinary — a dev server
                            // beside a Playwright run, or CI running packages in
                            // parallel — and only one of them can hold a fixed port.
                            // The loser is not degraded but *blind*: its own records
                            // never reach a service, while its readers keep looking at
                            // whatever holds the port, which is another process's
                            // service. `0` asks the operating system, and the address
                            // it gets is published by the log it started
                            // (`ILog.clusterUrl`), which is how a realm's port learns
                            // where to read.
                            cluster: {enabled: true, port: 0},
                        },
                        gateway: {
                            port: 0,
                            static: {},
                            debug: true,
                            expectedErrors: true,
                            // Static development keys, so sessions survive server hot-reloads
                            // and so `blong grant` can mint a token the same server accepts
                            // (see `devKeys.ts`).
                            sign: devSignKey,
                            encrypt: devEncryptKey,
                        },
                        systemDebug: {enabled: true},
                    },
                    integration: {
                        remote: {canSkipSocket: true},
                        // Port 0, for the reason the `dev` block gives: two processes on
                        // one machine must not want the same socket.
                        log: {cluster: {enabled: true, port: 0}},
                        gateway: {
                            debug: true,
                            expectedErrors: true,
                        },
                        // Long-lived normally, but in CI the test run IS the
                        // work, so the process is expected to end after it.
                        exit: isCI(),
                    },
                    // Playwright drives the platform from its own webServer,
                    // so it has to outlive the test command. Declared here so
                    // the runner can ask the config instead of pattern-matching
                    // the intent names.
                    playwright: {
                        exit: false,
                        log: {
                            // Port 0, for the reason the `dev` block gives.
                            cluster: {enabled: true, port: 0},
                            // The runner pipes this process's stdout (`stdout: 'pipe'`),
                            // so `isTTY()` is false and the `dev` block would leave the
                            // records plain — while the runner relays those very lines
                            // into the terminal and colours its own output beside them.
                            // A Playwright run is watched, so the records are too; the
                            // `ci` block below takes that back for a captured run.
                            color: true,
                        },
                    },
                    /**
                     * A run whose output is captured rather than watched. The
                     * Playwright webServer passes this last in CI, so it wins over the
                     * `playwright` block's colours. A captured run is also the run whose
                     * report nobody is watching, so its Allure results are written and
                     * its HTML report generated at the end.
                     */
                    ci: {
                        log: {color: false},
                        // Results, not a report: `blong-dev` turns every producer's results
                        // into the one report a package publishes, so generating here would
                        // be the same work again, into a directory nobody uploads.
                        watch: {allure: {enabled: true}},
                    },
                    /**
                     * A deployed process never runs the service itself: the
                     * service is deployed once, beside the processes whose
                     * records it assembles, and they point at it with
                     * `log.cluster.url`. Left out, a process that happened to
                     * carry both this intent and a development one would start a
                     * second service per replica.
                     */
                    prod: {log: {cluster: {enabled: false}}},
                    // Schema creation / seeding finishes, then exits.
                    db: {exit: true},
                    /**
                     * A CLI process does its work in-process and exits: it
                     * serves nothing, watches nothing, and resolves every
                     * dispatch locally.
                     */
                    cli: {
                        gateway: false,
                        rpcServer: false,
                        apiGateway: false,
                        restFs: false,
                        systemDebug: false,
                        mcp: false,
                        resolution: false,
                        // `{enabled: false}`, NOT `false`: the load step that
                        // records handler folders and files still runs (it is
                        // what feeds `Registry.describe()`); only chokidar is
                        // skipped.
                        watch: {enabled: false, logLevel: 'warn'},
                        // Dispatch in-process instead of over HTTP.
                        remote: {canSkipSocket: true},
                        // A command's stdout carries its result and has to stay
                        // parseable, so the framework's own logging is quietened
                        // here rather than by each CLI remembering to do it. The
                        // cluster service is off for the same reason it is a
                        // command: nothing here is long enough to draw, and a
                        // short-lived process must not hold a socket open.
                        log: {level: 'warn', cluster: {enabled: false}},
                        apiSchema: {logLevel: 'warn'},
                        exit: true,
                    },
                },
            },
            configNames,
            platformApi.configs,
        );
        loadedConfigs.push(...frameworkConfigs);
        items = topoSort([
            {
                name: 'log',
                deps: [],
                // The implementation is chosen by configuration rather than by
                // the loader. The closure runs long after every source has
                // merged, so `log.impl` is settled by the time it is called; the
                // module is imported lazily either way, so an unselected
                // implementation is never even loaded.
                load: () => {
                    if (rootKind === 'browser' && globalThis.window) {
                        return import('./BrowserLog.ts');
                    }
                    const impl = (mergedConfig as {log?: {impl?: string}} | undefined)?.log?.impl;
                    return impl === 'semantic'
                        ? import(/* @vite-ignore */ './SemanticLog' + extension)
                        : import(/* @vite-ignore */ './Log' + extension);
                },
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
                          load: () => import(/* @vite-ignore */ './RpcClient' + extension),
                      },
                      {
                          name: 'rpcServer',
                          deps: ['log'],
                          load: () => import(/* @vite-ignore */ './RpcServer' + extension),
                      },
                      {
                          name: 'gateway',
                          deps: ['log'],
                          load: () => import(/* @vite-ignore */ './Gateway' + extension),
                      },
                      {
                          name: 'apiGateway',
                          deps: ['log', 'gateway', 'local'],
                          load: () => import(/* @vite-ignore */ './ApiGateway' + extension),
                      },
                      {
                          name: 'restFs',
                          deps: ['log', 'gateway'],
                          load: () => import(/* @vite-ignore */ './RestFs' + extension),
                      },
                      {
                          name: 'systemDebug',
                          deps: ['log', 'gateway', 'registry', 'rpcServer'],
                          load: () => import(/* @vite-ignore */ './SystemDebug' + extension),
                      },
                      {
                          name: 'mcp',
                          deps: ['log', 'gateway', 'registry', 'remote', 'apiSchema'],
                          load: () => import(/* @vite-ignore */ './Mcp' + extension),
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
                          load: () => import(/* @vite-ignore */ './Registry' + extension),
                      },
                      {
                          name: 'codec',
                          deps: ['log'],
                          load: () => import(/* @vite-ignore */ './codec/server' + extension),
                      },
                      {
                          name: 'orchestrator',
                          deps: ['log'],
                          load: () => import(/* @vite-ignore */ './orchestrator/index' + extension),
                      },
                      {
                          name: 'adapter',
                          deps: ['log'],
                          load: () => import(/* @vite-ignore */ './adapter/server' + extension),
                      },
                  ]),
        ]).map(({name, load}) => {
            const fn = load;
            Object.defineProperty(fn, 'name', {value: name});
            return fn;
        });
    }
    loadedConfigs.push(...activeConfigs(mod, configNames, platformApi.configs));
    const configPromise = platformApi.loadConfig(
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
    // The config is what says how slow a step may be (`log.slowMs`), so it cannot
    // itself be measured against a configured margin — only against the default.
    const {loadedConfig: mergedConfig, configRuntime} = await withProgress(
        bootstrap,
        `config ${name}`,
        configPromise,
        {slowMs: SLOW_STEP_MS},
    );

    // Populate the manifest from config values (e.g. `--manifest.gatewayPort=8080`
    // parsed by blong-config into `mergedConfig.manifest.gatewayPort`).
    if (manifest && mergedConfig.manifest && typeof mergedConfig.manifest === 'object') {
        Object.assign(manifest, mergedConfig.manifest);
    }

    // An intent that switches a feature OFF is not overridable by a template's
    // convenience defaults. The standalone-realm wrapper below declares
    // ephemeral `gateway`/`rpcServer` ports in its `default` block; that block is
    // pushed *after* the framework's intent blocks and would otherwise silently
    // re-enable a listener the `cli` intent deliberately disabled.
    for (const config of frameworkConfigs) {
        if (!config || typeof config !== 'object') continue;
        for (const [key, value] of Object.entries(config)) {
            if (value === false) (mergedConfig as Record<string, unknown>)[key] = false;
        }
    }

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
    // From here on every step of the load is measured against the margin the
    // config names, and a step that crosses it is reported at warn level through
    // whichever logger exists — the realm's own, or the bootstrap one while the
    // log component is still being built.
    const slowMs = slowStepMs(mergedConfig.log);
    const stepLog = () => logger ?? bootstrap;
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
        const discoveredFolders = await withProgress(
            stepLog(),
            `discover layers of ${name}`,
            discoverLayerFolders(platformApi, base, rootKind, explicitChildren),
            {slowMs},
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

    /**
     * The realms the framework ships and loads beside a suite that depends on them.
     *
     * A suite gets these without naming them, which is the point: the four lines
     * of imports and the four matching config blocks that every suite used to
     * repeat are the kind of wiring that drifts — a suite that forgot one failed
     * later, somewhere else, with a symptom that did not name the cause.
     *
     * Two properties make that safe:
     *
     * - **The suite's own manifest decides**, so a suite that does not depend on a
     *   realm is not given one. That is why the list may name realms a particular
     *   suite never installs: an undeclared package is skipped, not reported.
     * - **A realm the suite already lists is skipped too.** The suite's own
     *   children load first (they are wrapped to record the realm they produce),
     *   so by the time these are reached the already-loaded realms are known and
     *   are not loaded twice — a doubled realm would register every handler twice.
     *
     * A suite that wants none of it says so by name, in its own config:
     *
     *     config: {default: {framework: {realms: {access: false}}}}
     *
     * Only the server platform is covered: the browser loader resolves children
     * through Vite, which must see the specifier in the source to bundle it, so a
     * browser suite still names its browser realms itself.
     */
    /**
     * The package a specifier names — `@scope/name/sub` → `@scope/name`, `name/sub`
     * → `name` — so that the suite's manifest can be asked about it.
     */
    const packageNameOf = (specifier: string): string => {
        const parts = specifier.split('/');
        return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] as string);
    };

    /**
     * The packages the suite declares in its own manifest.
     *
     * The framework realms are loaded because the suite *depends* on them, and the
     * manifest is where a suite says so — `dependencies`, `devDependencies` and
     * `peerDependencies` alike, because a realm a suite uses only from its own tests
     * is still a realm that suite declares. `core/blong-realm/index.ts` is exactly
     * that case: it names its own realm and leaves blong-server, blong-login,
     * blong-core and blong-access to the framework, and declares all four in
     * `devDependencies`.
     *
     * Asking by resolution instead asks a different question, and one the ambient
     * environment answers: `createRequire(...).resolve()` falls back to `NODE_PATH`,
     * which the tap runner points at the pnpm store, so under `blong-dev test` every
     * suite resolved every framework realm. A suite that declares none of them then
     * loaded blong-server's knex adapter — pointed at a database named after the
     * suite — and died on the connection: `demo/blong-cli` exited 1 with `Unknown
     * database 'blong-cli'` and `test/framework/nscfg` with `ER_BAD_DB_ERROR`
     * (F-206). A manifest cannot be reached that way.
     */
    const declaredDependencies: ReadonlySet<string> = (() => {
        const url = mod.url ?? mergedConfig.url;
        const from = typeof url === 'string' && url.length > 0 ? url : undefined;
        /** The names declared in the three maps an installed dependency appears in. */
        const names = (manifest: unknown): string[] =>
            ['dependencies', 'devDependencies', 'peerDependencies'].flatMap(map =>
                Object.keys((manifest as Record<string, object> | null)?.[map] ?? {}),
            );
        // `mod.pkg` is normally the suite's own package.json — the loader reads the
        // file beside the suite when the suite supplies none — but a suite may supply
        // a *trimmed* manifest (`blong-suite/server.ts` passes `{name, version}`), and
        // a trimmed manifest must not be read as a suite that declares nothing. The
        // file beside the suite is the authority, so it is asked as well; only a suite
        // with no manifest at all ends up declaring nothing.
        const manifests: unknown[] = [mod.pkg];
        if (from) {
            try {
                manifests.push(platformApi.createRequire?.(from)?.('./package.json'));
            } catch {
                // No manifest beside the suite — nothing to declare.
            }
        }
        return new Set(manifests.flatMap(names));
    })();

    /**
     * Resolve a framework realm from the suite's own location.
     *
     * A suite that does not depend on the package has no such realm, and that is
     * not an error: the framework ships realms for suites that ship them, and asks
     * the suite's manifest which those are. A specifier the manifest does not
     * declare is not resolved at all — resolution on its own is not that question,
     * because `NODE_PATH` can make it succeed for a suite that depends on nothing
     * (see `declaredDependencies`).
     */
    const resolveFromSuite = (specifier: string): string | undefined => {
        if (!declaredDependencies.has(packageNameOf(specifier))) return undefined;
        // The suite's own bootstrap file is the base — `mod.url`. `mergedConfig.url`
        // is the *config* url, which `ConfigRuntime` fills only when a config names
        // one, so falling back to this module's own location would resolve every
        // framework realm from `blong-gogo`, which depends on none of them: each one
        // would be skipped as unresolvable, looking exactly like a suite that ships
        // none of them. That mistake is invisible in the logs, so the base is taken
        // from the module and the impossible case warns (see below).
        const url = mod.url ?? mergedConfig.url;
        const from = typeof url === 'string' && url.length > 0 ? url : import.meta.url;
        try {
            return platformApi.createRequire?.(from)?.resolve(specifier);
        } catch {
            return undefined;
        }
    };

    /**
     * The realms the framework ships and loads for a suite that depends on them.
     *
     * A suite gets these without naming them, which is the point: the four lines
     * of imports and the four matching config blocks every suite used to repeat
     * are the kind of wiring that drifts — a suite that forgot one failed later,
     * somewhere else, with a symptom that did not name the cause.
     *
     * Three properties make it safe:
     *
     * - **The suite's own manifest decides**, so a suite that does not depend on a
     *   realm does not get it — the dependency is looked for in `dependencies`,
     *   `devDependencies` and `peerDependencies`, never in whatever the ambient
     *   resolution happens to find (see `declaredDependencies`). That is why the
     *   list may name realms a particular suite never installs: an undeclared
     *   package is skipped, not reported.
     * - **A realm the suite already lists is skipped too.** The suite's own
     *   children are wrapped to record the realm each one produces, and these are
     *   appended after them, so by the time they are reached the already-loaded
     *   realms are known and nothing is loaded twice — a doubled realm would
     *   register every handler twice.
     * - **Only the platform root does this.** `api` is absent exactly when this is
     *   the load the platform was started with; a nested realm load receives it.
     *   Without this the framework would add its realms *inside every realm it
     *   contains*, which is not a bigger list but a different graph.
     *
     * A suite that wants none of it says so by name, in its own config:
     *
     *     config: {default: {framework: {realms: {access: false}}}}
     *
     * Only the server platform is covered: the browser loader resolves children
     * through Vite, which has to see the specifier in the source to bundle it, so
     * a browser suite still names its browser realms itself.
     */
    const frameworkRealms: ReadonlyArray<{name: string; specifier: string}> = [
        {name: 'server', specifier: '@feasibleone/blong-server/server.ts'},
        {name: 'login', specifier: '@feasibleone/blong-login/server.ts'},
        {name: 'core', specifier: '@feasibleone/blong-core/server.ts'},
        {name: 'access', specifier: '@feasibleone/blong-access/server.ts'},
        {name: 'blong', specifier: '@feasibleone/blong-realm/server.ts'},
    ];
    // Without a base there is nothing to resolve from, and every framework realm is
    // silently absent — the symptom is a gateway that refuses every unauthenticated
    // route (the login realm is not mounted) rather than anything that names this.
    if (isPlatformRoot && rootKind === 'server' && !mod.url && !mergedConfig.url) {
        console.warn(
            'blong: the suite exposes no url, so no framework realm can be resolved from it ' +
                '(server, login, core, access, blong). Name them as children, or give the suite a url.',
        );
    }
    /**
     * The realms this load tree produced, by the file they came from.
     *
     * Filled where a realm module is created (`loadRealm`), not by the wrapper
     * below: a suite's child answers with the realm *factory*, and only the load
     * that calls it can read the url off the module.
     */
    const loadedRealmUrls = new Set<string>();
    if (isPlatformRoot) api!.loadedRealmUrls = loadedRealmUrls;
    const trackChild = (child: unknown): unknown =>
        typeof child === 'function'
            ? Object.defineProperty(
                  async (): Promise<unknown> => {
                      const value = await (child as () => Promise<unknown>)();
                      const url = (value as {url?: unknown} | undefined)?.url;
                      if (typeof url === 'string') loadedRealmUrls.add(normaliseUrl(url));
                      return value;
                  },
                  'name',
                  {value: (child as {name?: string}).name ?? 'child', configurable: true},
              )
            : child;
    // `rootKind`, not `platformApi.platform`: the latter names the transport
    // implementation, and a *browser* suite loaded in a Node process (the tap runner)
    // gets the server one — which made this load look like the server platform and
    // pull in the framework realms' `server.ts` entries. blong-login's `./orchestrator`
    // came with them and its `token.ts` needs a gateway that does not exist there, so
    // the whole tap process died before a test (T-114). `rootKind` is what the rest of
    // this loader already asks that question with.
    const frameworkChildren =
        isPlatformRoot && rootKind === 'server'
            ? frameworkRealms.map(({name, specifier}) => {
                  // The loop below looks a child's config up by its name and skips
                  // the child when there is none, so a realm loaded this way needs a
                  // block here. A suite that declares its own keeps it: this fills a
                  // gap rather than overriding one.
                  mergedConfig[name] ??= {};
                  return Object.defineProperty(
                      async (): Promise<unknown> => {
                          const realms = (
                              mergedConfig as {framework?: {realms?: Record<string, unknown>}}
                          ).framework?.realms;
                          if (realms?.[name] === false) return undefined;
                          const resolved = resolveFromSuite(specifier);
                          if (resolved === undefined) return undefined;
                          if (loadedRealmUrls.has(normaliseUrl(resolved))) return undefined;
                          loadedRealmUrls.add(normaliseUrl(resolved));
                          const loaded = await import(/* @vite-ignore */ resolved);
                          return loaded.default ?? loaded;
                      },
                      'name',
                      {value: name},
                  );
              })
            : [];

    let realm: IRealm;
    for (let item of items
        .concat(children.map(trackChild) as [])
        .concat(extraChildren)
        .concat(frameworkChildren)) {
        // Deliberately `platformApi.platform` here, not `rootKind`: this gate decides how a
        // folder-string child is *resolved*, and browser suites in the tap runner rely on the
        // server-side resolution (their folder layers must still load, or the browser test
        // group's handlers never register and its calls hang). Do not "fix" this to rootKind.
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
                                        const {createRealm} = await import(
                                            /* @vite-ignore */ './kopi' + extension
                                        );
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
                        // `.dev`-suffixed handler groups (e.g. `gateway/vision.dev/`)
                        // load only under the `dev` intent — a general dev-only gating
                        // convention for layers such as gateway/orchestrator.
                        const devActive =
                            configNames.includes('dev') || platformApi.configs.includes('dev');
                        for (const dirEntry of await platformApi.scan(base, item)) {
                            if (
                                dirEntry.isDirectory() &&
                                dirEntry.name.endsWith('.dev') &&
                                !devActive
                            )
                                continue;
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
                        }
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
            // The import and the start are separate steps with separate costs: an
            // import is the module graph, which is slow on a cold filesystem, while
            // a start is the component's own init. A delayed start that names only
            // "load log" would not say which of the two to look at, so the two are
            // reported under labels that do.
            const loadedModules = await withProgress(
                stepLog(),
                `import ${itemName}`,
                (item as () => Promise<unknown[]>)(),
                {slowMs},
            );
            const modules = Array.isArray(loadedModules) ? loadedModules : [loadedModules];
            let loadedCount = 0;
            await withProgress(
                stepLog(),
                `start ${itemName}`,
                (async () => {
                    for (const module of modules) {
                        const item = await module;
                        const fn = (item as {default?: unknown})?.default ?? item;
                        // A child may contribute nothing: an optional realm that is not
                        // configured, an adapter whose dependency is absent, a framework
                        // realm a suite does not depend on. Reading a kind off that used
                        // to throw `Symbol(blong:kind)` of undefined — a TypeError that
                        // names the symbol rather than the child that resolved to nothing,
                        // and that killed the whole process at boot (a demo suite that
                        // does not depend on blong-realm never started).
                        if (fn === undefined || fn === null) continue;
                        if (
                            typeof fn === 'function' &&
                            (fn.prototype instanceof Internal ||
                                (fn as unknown as Record<symbol, unknown>)[System])
                        ) {
                            api![itemName] = new (fn as IConstructor)(config, api);
                            await api![itemName].init?.();
                            if (itemName === 'log') {
                                logger = api!.log?.logger(
                                    mergedConfig[rootKind === 'browser' ? 'browser' : 'server']
                                        ?.load?.logLevel,
                                    {
                                        name,
                                        context: `${defKind}`,
                                    },
                                );
                                // Publish the address of the service this process started for
                                // its own records, if it started one. The realm that reads
                                // that service answers on a *port*, and a port needs an
                                // address: the service is bound on one the operating system
                                // chose (`log.cluster.port: 0`), so without this the reader
                                // would fall back to the conventional port and reach
                                // whichever *other* process on the machine holds it. Set
                                // before the realms load — the log is the first component —
                                // so a realm's port reads it as the string it is rather than
                                // as the manifest proxy's pending placeholder.
                                const clusterUrl = (api!.log as {clusterUrl?: string} | undefined)
                                    ?.clusterUrl;
                                if (clusterUrl !== undefined) manifest.clusterUrl = clusterUrl;
                            }
                        } else if (
                            ['solution', 'server', 'browser'].includes(
                                kind(fn as Record<symbol, Kinds>),
                            )
                        ) {
                            realm ||= new RealmImpl(mergedConfig, api!, rootKind);
                            realm.addModule(
                                itemName,
                                await loadRealm(
                                    platformApi,
                                    fn as Parameters<typeof loadRealm>[1],
                                    itemName,
                                    {
                                        [platformApi.platform]: mergedConfig[platformApi.platform],
                                        ...config,
                                    },
                                    configNames,
                                    manifest,
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
                        loadedCount += 1;
                    }
                })(),
                {
                    getProgress: () => ({done: loadedCount, total: modules.length}),
                },
            );
        }
    }
    realm ||= new RealmImpl(mergedConfig, api!, rootKind);
    if (!api?.registry) throw new Error('Registry not found in loaded modules');
    // Resolved from the active intents (see the `exit` keys in the synthetic
    // config above). The runner uses it to decide whether this process outlives
    // its work; absent means "keep running". Set here rather than in the
    // constructor so the value is read after every config source has merged.
    api.registry.exit = Boolean(mergedConfig.exit);
    return api.registry;
}
