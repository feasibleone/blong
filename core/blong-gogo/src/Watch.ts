import {
    handler,
    Internal,
    kind,
    type ConfigDiff,
    type Handlers,
    type IAdapterRegistry,
    type IApiSchema,
    type IConfigRuntime,
    type IErrorFactory,
    type ILog,
    type IModuleConfig,
    type IObjectSchema,
    type IPlatformApi,
    type IRegistry,
    type IRemote,
    type IWatcher,
} from '@feasibleone/blong/types';
import type {Dirent} from 'node:fs';
import merge from 'ut-function.merge';

import layerProxy from './layerProxy.ts';

export interface IWatch {
    start: (realm: IRegistry, remote: IRemote, configOverride: object) => Promise<void>;
    test: (tester: unknown) => Promise<void>;
    stop: () => Promise<void>;
    load: <T extends {result: unknown}>(
        config: {name: string; pkg: IModuleConfig['pkg']; base: string},
        isDirectory: boolean | Record<string, () => Promise<unknown>> | undefined,
        isFile: boolean | (() => Promise<unknown>) | undefined,
        ...path: string[]
    ) => Promise<(api: T) => T>;
    /** Attach a ConfigRuntime so config-file changes trigger in-process reloads */
    setConfigRuntime?(configRuntime: IConfigRuntime): void;
    /** Attach the registry objectSchema so hot-reload paths can pass it to layerProxy */
    setObjectSchema?(schema: IObjectSchema): void;
}

interface ITestContext {
    test: (name: string, fn: (t: unknown) => void | Promise<void>) => unknown;
}
const isYaml = (filename: string): boolean => /\.ya?ml$/i.test(filename);
const isJSON = (filename: string): boolean => /\.jsonl?$/i.test(filename);
const isCode = (filename: string): boolean => /(?<!\.d)\.m?(t|j)sx?$/i.test(filename);
const isLayerActivation = (filename: string): boolean =>
    /^layer\.(server|browser)\.[mc]?[tj]sx?$/i.test(filename);
const isConfig = (filename: string): boolean => /^config\.[mc]?[tj]sx?$/i.test(filename);
const isPlay = (filename: string): boolean => /\.play\.[mc]?[tj]sx?$/i.test(filename);

const prefixRE: RegExp = /(?:\d+-)?(.*)/;

interface IConfig {
    enabled: boolean;
    test: string;
    ignored: string[];
    configs: string[];
    logLevel: Parameters<ILog['logger']>[0];
}

// ---------------------------------------------------------------------------
// affectedNamespaces
// ---------------------------------------------------------------------------

/**
 * Given a diff and the set of known port names (e.g. `"realm.adapter.db"`),
 * return the subset of port names whose config sub-tree changed.
 *
 * A port named `"realm.adapter.db"` is considered affected if any diff key
 * starts with `"realm.adapter.db."` or equals `"realm.adapter.db"`.
 */
export function affectedNamespaces(diff: ConfigDiff, portNames: Iterable<string>): Set<string> {
    const affected = new Set<string>();
    for (const portName of portNames) {
        for (const diffKey of diff.keys()) {
            if (diffKey === portName || diffKey.startsWith(portName + '.')) {
                affected.add(portName);
                break;
            }
        }
    }
    return affected;
}

export default class Watch extends Internal implements IWatch {
    #config: IConfig = {
        enabled: false,
        test: '',
        ignored: [],
        configs: [],
        logLevel: 'debug',
    };

    #handlerFolders: Map<string, {name: string; pkg: IModuleConfig['pkg']; base: string}> =
        new Map();
    #handlerFiles: Map<string, {name: string; pkg: IModuleConfig['pkg']; base: string}> = new Map();
    #layerFiles: Map<string, {name: string; pkg: IModuleConfig['pkg']; base: string}> = new Map();
    #watchers: IWatcher[] = [];
    #port: () => unknown;
    #error: IErrorFactory;
    #objectSchema: IObjectSchema;
    #apiSchema: IApiSchema;
    #emit: EventTarget = new EventTarget();
    #configRuntime: IConfigRuntime | null = null;
    #platform: IPlatformApi;

    public constructor(
        config: IConfig,
        {
            error,
            log,
            port,
            apiSchema,
            objectSchema,
            platform,
        }: {
            error: IErrorFactory;
            log: ILog;
            port: () => unknown;
            apiSchema: IApiSchema;
            objectSchema: IObjectSchema;
            platform: IPlatformApi;
        },
    ) {
        super({log});
        this.merge(this.#config, config);
        this.#port = port;
        this.#error = error;
        this.#apiSchema = apiSchema;
        this.#objectSchema = objectSchema;
        this.#platform = platform;
    }

    /** Attach the registry objectSchema so hot-reload paths can pass it to layerProxy */
    public setObjectSchema(schema: IObjectSchema): void {
        this.#objectSchema = schema;
    }

    /** Attach a ConfigRuntime so config-file changes trigger in-process reloads */
    public setConfigRuntime(configRuntime: IConfigRuntime): void {
        this.#configRuntime = configRuntime;
    }

    /**
     * Validates handler name matches filename and sets name property for anonymous handlers
     * @param item The handler item to validate
     * @param filename The file path
     * @param expectedName The expected handler name based on filename
     * @returns The handler name (either explicit or derived from filename)
     */
    private _validateAndSetHandlerName(
        item: {name?: string},
        filename: string,
        expectedName?: string,
    ): string {
        const actualName = item['name'] && item['name'] !== 'default' ? item['name'] : null;

        // For files defining a single handler, report error on name mismatch
        if (kind(item) === 'handler' && actualName && actualName !== expectedName) {
            throw new Error(
                `Handler name mismatch in '${filename}': ` +
                    `function is named '${actualName}' but file is named '${expectedName}.ts'. ` +
                    `Either rename the function to '${expectedName}' or rename the file to '${actualName}.ts'.`,
            );
        }

        const name = actualName || expectedName;
        // Ensure handler name property is set for anonymous handlers
        if (kind(item) === 'handler' && !actualName) {
            Object.defineProperty(item, 'name', {
                value: name,
                configurable: true,
                enumerable: false,
            });
        }

        return name!;
    }

    private async _generate(files: {filename: string; name: string}[], dir: string): Promise<void> {
        const [schema, names] = files.reduce(
            (prev, {filename, name}) => {
                const schema = this.#platform
                    .readFileSync(filename)
                    .toString()
                    .match(
                        /^(\/\*\*((?!\*\/\n).)*\*\/\n)?type Handler = \(((?!(>|}|>});?\n).)*(>|}|>});?\n/ms,
                    )?.[0];
                return schema
                    ? [
                          [...prev[0], schema.replace('type Handler = (', `type ${name} = (`)],
                          [...prev[1], name],
                      ]
                    : prev;
            },
            [[] as string[], [] as string[]],
        );
        const {Formatter, TypeScriptToTypeBox} = await import('@sinclair/typebox-codegen');
        if (schema.length)
            this.#platform.writeFileSync(
                this.#platform.join(dir, '~.schema.ts'),
                Formatter.Format(`import {validationHandlers} from '@feasibleone/blong';
            import { Type, type Static } from 'typebox';

            ${TypeScriptToTypeBox.Generate(schema.sort().join('\n'), {useTypeBoxImport: false}).trim()}

            export default validationHandlers({
                ${names.sort().join(',\n')}
            });

            declare module '@feasibleone/blong' {
                interface ISchema {
                    ${names
                        .map(
                            name =>
                                `${name}(params: Parameters<${name}>[0], $meta: IMeta): ReturnType<${name}>;`,
                        )
                        .join('\n')}
                }
            }

        `),
            );
    }

    private async _loadHandlers(
        directory: true | Record<string, () => Promise<unknown>> | undefined,
        config: {
            name: string;
            pkg: IModuleConfig['pkg'];
            base: string;
            configNames?: string[];
            namespace?: Record<string, object>;
            [other: string]: unknown;
        },
        ...path: string[]
    ): Promise<<T>(api: T) => T> {
        const dir = this.#platform.join(...path);
        const handlers: unknown[] = [];
        const validations: unknown[] = [];
        const apis: unknown[] = [];
        const libs: unknown[] = [];
        const assets: unknown[] = [];
        const handlerFilenames: {filename: string; name: string}[] = [];
        let latest = 0;
        const isFile = () => true;
        const isDirectory = () => false;
        const allFiles =
            directory === true
                ? await this.#platform.scan(dir)
                : Object.keys(directory ?? {}).map(path => ({
                      name: this.#platform.basename(path),
                      isFile,
                      isDirectory,
                  }));
        // if (directory !== true) debugger;
        const configFile = allFiles.find(entry => entry.isFile() && isConfig(entry.name));
        if (configFile) {
            const configFilePath = this.#platform.join(dir, configFile.name);
            const loaded = (
                await import(
                    /* @vite-ignore */ this.#config.enabled
                        ? configFilePath + '?' + Date.now()
                        : configFilePath
                )
            ).default;
            const folderName = this.#platform.basename(dir);
            const mutableConfig = config;
            const configNames = mutableConfig.configNames ?? [];
            const folderConfig =
                loaded &&
                typeof loaded === 'object' &&
                typeof loaded.default === 'object' &&
                loaded.default !== null
                    ? merge(
                          {},
                          ...['default', ...configNames].map(name => loaded[name]).filter(Boolean),
                      )
                    : (loaded ?? {});
            const namespaceOverride = mutableConfig?.namespace?.[folderName] ?? {};
            mutableConfig[folderName] = merge({}, folderConfig, namespaceOverride);
        }
        const handlerFiles = allFiles
            .sort()
            .filter(
                entry =>
                    entry.isFile() &&
                    isCode(entry.name) &&
                    !isLayerActivation(entry.name) &&
                    !isConfig(entry.name) &&
                    !isPlay(entry.name),
            );
        await this.#apiSchema?.generateDir(dir, handlerFiles as Dirent[]);
        for (const handlerEntry of handlerFiles) {
            const filename = this.#platform.join(dir, handlerEntry.name);
            if (
                directory === true &&
                handlerEntry.name === '~.schema.ts' &&
                this.#platform.statSync(filename).mtime.getTime() < latest &&
                handlerFilenames.length
            )
                await this._generate(handlerFilenames, dir);
            if (directory === true && (await this.#apiSchema.generateFile(filename))) continue;
            const item =
                directory === true
                    ? (
                          await import(
                              /* @vite-ignore */ this.#config.enabled
                                  ? filename + '?' + Date.now()
                                  : filename
                          )
                      ).default
                    : ((await directory![filename]()) as {default: unknown}).default;
            if (!item) {
                this.log?.error?.('Error loading ' + filename);
                continue;
            }
            const expectedName = this.#platform.basename(
                filename,
                this.#platform.extname(filename),
            );
            const name = expectedName;
            (kind(item) === 'validation'
                ? validations
                : kind(item) === 'api'
                  ? apis
                  : kind(item) === 'lib'
                    ? libs
                    : handlers
            ).push(item);
            if (kind(item) === 'handler') {
                if (directory === true)
                    latest = Math.max(latest, this.#platform.statSync(filename).mtime.getTime());
                handlerFilenames.push({name, filename});
            }
        }
        const assetFiles = allFiles.filter(
            entry => entry.isFile() && (isYaml(entry.name) || isJSON(entry.name)),
        );
        for (const assetFile of assetFiles) {
            const filename = this.#platform.join(dir, assetFile.name);
            assets.push(
                handler(() => ({
                    assets: {[this.#platform.basename(filename)]: `file://${filename}`},
                })),
            );
        }
        this.#handlerFolders.set(dir, config);
        return api => {
            const apiAny = api as Record<string, (...args: unknown[]) => unknown>;
            if (validations.length)
                apiAny[this.#platform.basename(dir) + '.validation'](
                    [...libs, ...validations],
                    config.name + '.' + this.#platform.basename(dir) + '.validation',
                    this.#platform.relative('.', dir),
                );
            if (apis.length)
                apiAny[this.#platform.basename(dir) + '.api'](
                    [...libs, ...apis],
                    config.name + '.' + this.#platform.basename(dir) + '.api',
                    this.#platform.relative('.', dir),
                );
            if (assets.length)
                apiAny[this.#platform.basename(dir) + '.asset'](
                    assets,
                    config.name + '.' + this.#platform.basename(dir) + '.asset',
                    this.#platform.relative('.', dir),
                );
            if (handlers.length)
                apiAny[this.#platform.basename(dir)](
                    [...libs, ...handlers],
                    config.name + '.' + this.#platform.basename(dir),
                    this.#platform.relative('.', dir),
                );
            return api;
        };
    }

    public async load<T extends {result: unknown}>(
        config: {name: string; pkg: IModuleConfig['pkg']; base: string},
        isDirectory: boolean | Record<string, () => Promise<unknown>> | undefined,
        isFile: boolean | object | undefined,
        ...path: string[]
    ): Promise<(api: T) => T> {
        if (isDirectory) {
            return this._loadHandlers(
                isDirectory === true
                    ? true
                    : (isDirectory as Record<string, () => Promise<unknown>>),
                config,
                ...path,
            );
        } else if (isFile) {
            // if (isFile !== true) debugger;
            const filename = this.#platform.join(...path);
            if (
                isCode(filename) &&
                !isLayerActivation(this.#platform.basename(filename)) &&
                !isPlay(this.#platform.basename(filename))
            ) {
                const item =
                    typeof isFile === 'function'
                        ? (await isFile()).default
                        : (
                              await import(
                                  /* @vite-ignore */
                                  this.#config.enabled ? filename + '?' + Date.now() : filename
                              )
                          ).default;
                const expectedName = this.#platform
                    .basename(filename, this.#platform.extname(filename))
                    .match(prefixRE)?.[1];
                const itemName = this._validateAndSetHandlerName(item, filename, expectedName);
                if (kind(item) === 'handler') {
                    this.#handlerFiles.set(filename, config);
                    return Object.defineProperty(
                        (api: T) => {
                            (api as Record<string, (...args: unknown[]) => unknown>)[itemName](
                                [item],
                                config.name + '.' + itemName,
                                this.#platform.relative('.', filename),
                            );
                            return api;
                        },
                        'name',
                        {value: itemName},
                    );
                } else {
                    this.#layerFiles.set(filename, config);
                    return Object.defineProperty(
                        (api: T) => {
                            (api as Record<string, (...args: unknown[]) => unknown>)[itemName](
                                typeof item === 'function' &&
                                    !['adapter', 'orchestrator'].includes(kind(item))
                                    ? item(api)
                                    : item,
                                config.name + '.' + itemName,
                                this.#platform.relative('.', filename),
                            );
                            return api;
                        },
                        'name',
                        {value: itemName},
                    );
                }
            }
        }
        return (api: T) => api;
    }

    /**
     * In-process config reload pipeline:
     *  1. Ask ConfigRuntime to reload and compute the diff
     *  2. Emit a structured log event with the diff scope
     *  3. For each affected port: call configChanged if present, else stop+start
     *  4. Trigger test re-run
     */
    private async _reloadConfig(registry: IRegistry, configOverride: object): Promise<void> {
        if (!this.#configRuntime) {
            // No ConfigRuntime attached — nothing to do (graceful degradation)
            this.log?.warn?.({
                $meta: {mtid: 'event', method: 'watch.config.reload'},
                message: 'ConfigRuntime not attached; config change ignored',
            });
            return;
        }

        const prev = this.#configRuntime.rawSnapshot;
        const diff: ConfigDiff = await this.#configRuntime.reload();

        this.log?.info?.({
            $meta: {mtid: 'event', method: 'watch.config.reload'},
            changed: Array.from(diff.keys()),
        });

        if (diff.size === 0) return;

        const affected = affectedNamespaces(diff, registry.ports.keys());
        const next = this.#configRuntime.snapshot;

        for (const portId of affected) {
            const portInstance = await registry.getPort(portId);
            if (!portInstance) continue;

            if (typeof portInstance['configChanged'] === 'function') {
                // Adapter supports the configChanged hook — zero-downtime update
                try {
                    await portInstance['configChanged'](diff, next, prev);
                } catch (error) {
                    this.log?.error?.(error);
                }
            } else {
                // Fallback: stop and restart the port with the current configOverride
                await portInstance.stop();
                const fresh = await registry.createPort(portId);
                if (fresh) {
                    await fresh.start(configOverride);
                    await fresh.ready();
                }
            }
        }

        this.#emit.dispatchEvent(new Event('test'));
    }

    /**
     * Common reload unit: re-import a changed file, re-wrap via layerProxy,
     * replace in registry, and signal tests.
     *
     * This unifies the three reload paths (layer file, single handler file,
     * handler folder) into a single abstraction.
     */
    private async _reloadUnit(
        registry: IRegistry,
        configOverride: object,
        filename: string,
    ): Promise<void> {
        type LayerResult = {
            result: Record<string, {methods: unknown[]; source?: string; port?: unknown}>;
        };
        type ModuleConfig = Parameters<typeof layerProxy>[4];
        // Path 1: Layer file changed — recreate and restart the port
        const layerConfig = this.#layerFiles.get(filename);
        if (layerConfig) {
            const id = this.#platform.basename(filename, this.#platform.extname(filename));
            const proxy = layerProxy(
                this.#error,
                this.#objectSchema,
                this.#apiSchema,
                this.#port,
                layerConfig as unknown as ModuleConfig,
            );
            const loadFn = (await this.load(layerConfig, false, true, filename)) as (
                api: LayerResult,
            ) => LayerResult;
            const item = loadFn(proxy as unknown as LayerResult).result[id];
            registry.ports.set(layerConfig.name + '.' + id, item.port as IAdapterRegistry);
            const port = await registry.createPort(layerConfig.name + '.' + id);
            if (!port) return;
            await port.start(configOverride);
            await port.ready();
            await registry.connected();
            this.#emit.dispatchEvent(new Event('test'));
            return;
        }

        // Path 2: Config file changed
        if (this.#config.configs.includes(filename)) {
            await this._reloadConfig(registry, configOverride);
            return;
        }

        // Path 3a: Single handler file changed
        let config = this.#handlerFiles.get(filename);
        if (config) {
            const importProxyCallback = await this.load(config, false, true, filename);
            const name = importProxyCallback.name;
            const cbResult = (importProxyCallback as unknown as (api: LayerResult) => LayerResult)(
                layerProxy(
                    this.#error,
                    this.#objectSchema,
                    this.#apiSchema,
                    this.#port,
                    config as unknown as ModuleConfig,
                ) as unknown as LayerResult,
            );
            await registry.replaceHandlers(
                config.name + '.' + name,
                cbResult.result[name].methods as Handlers,
            );
        } else {
            // Path 3b: Handler folder changed — reload entire folder
            const dir = this.#platform.dirname(filename);
            config = this.#handlerFolders.get(dir);
            if (config) {
                const handlers = (await this._loadHandlers(true, config, dir))(
                    layerProxy(
                        this.#error,
                        this.#objectSchema,
                        this.#apiSchema,
                        this.#port,
                        config as unknown as ModuleConfig,
                    ) as unknown as LayerResult,
                ) as unknown as LayerResult;
                await registry.replaceHandlers(
                    config.name + '.' + this.#platform.basename(dir),
                    handlers.result[this.#platform.basename(dir)].methods as Handlers,
                );
                if (handlers.result[this.#platform.basename(dir) + '.validation'])
                    await registry.replaceHandlers(
                        config.name + '.' + this.#platform.basename(dir) + '.validation',
                        handlers.result[this.#platform.basename(dir) + '.validation']
                            .methods as Handlers,
                    );
            }
        }
        await registry.connected();
        this.#emit.dispatchEvent(new Event('test'));
    }

    private _watch(registry: IRegistry, configOverride: object): void {
        const fsWatcher = this.#platform.watch?.(
            Array.from(this.#handlerFolders.keys())
                .map(folder => [
                    `${folder}/*.ts`,
                    `${folder}/*.yaml`,
                    `${folder}/*.sql`,
                    `${folder}/*.html`,
                ])
                .flat()
                .concat(Array.from(this.#handlerFiles.keys()))
                .concat(Array.from(this.#layerFiles.keys()))
                .concat(this.#config.configs),
            {
                cwd: '.',
                ignoreInitial: true,
                ignored: ['.git/**', 'node_modules/**', 'dist/**', ...(this.#config.ignored || [])],
            },
        );
        if (!fsWatcher) return;
        this.#watchers.push(fsWatcher);
        fsWatcher.on('error', error => this.log?.error?.(error));
        fsWatcher.on('all', async (event, filename) => {
            try {
                filename = this.#platform.resolve(filename);
                this.log?.info?.(
                    {
                        $meta: {mtid: 'event', method: `watch.reload.${event}`},
                    },
                    filename,
                );
                await this._reloadUnit(registry, configOverride, filename);
            } catch (error) {
                this.log?.error?.(error);
            }
        });
    }

    public async start(
        registry: IRegistry,
        remote: IRemote,
        configOverride: object,
    ): Promise<void> {
        this.log?.debug?.({
            $meta: {mtid: 'event', method: 'watch.start'},
            dir: Array.from(this.#handlerFolders.keys())
                .concat(Array.from(this.#handlerFiles.keys()))
                .concat(Array.from(this.#layerFiles.keys()))
                .map(folder => this.#platform.relative('.', folder)),
        });
        if (this.#config.test) {
            this.#emit.addEventListener('test', async (event: Event) => {
                const {done, test} = ((event as CustomEvent).detail ?? {}) as {
                    done?: (error?: unknown) => void;
                    test?: unknown;
                };
                try {
                    const chain = await (
                        await import('./chain.ts')
                    ).default(test as ITestContext, this.log);

                    const steps = await Promise.all(
                        ([] as string[]).concat(this.#config.test).map(async method => {
                            const result = await remote.remote(method)({}, {});
                            if (Array.isArray(result) && !('name' in result)) {
                                Object.defineProperty(result, 'name', {
                                    value: method.replace(/^test\./, '').replace(/\./g, ' '),
                                    configurable: true,
                                });
                            }
                            return result;
                        }),
                    );
                    await Promise.all(
                        steps.map(step => chain(step as Parameters<typeof chain>[0])),
                    );
                } catch (error) {
                    this.log?.error?.(error);
                    done?.(error);
                    return;
                }
                done?.();
            });
        }
        if (this.#config.enabled) this._watch(registry, configOverride);

        await registry.connected();
    }

    public async test(framework: unknown): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            // this.#emit.emit('test', error => (error ? reject(error) : resolve()), framework);
            this.#emit.dispatchEvent(
                new CustomEvent('test', {
                    detail: {
                        done: (error?: unknown) => (error ? reject(error) : resolve()),
                        test: framework,
                    },
                }),
            );
        });
    }

    public async stop(): Promise<void> {
        while (this.#watchers.length) {
            const watcher = this.#watchers.pop();
            await watcher?.close();
        }
    }
}
