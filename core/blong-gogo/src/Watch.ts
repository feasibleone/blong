import {
    Internal,
    kind,
    type IApiSchema,
    type IErrorFactory,
    type ILog,
    type IModuleConfig,
    type IRegistry,
    type IRemote,
} from '@feasibleone/blong';
import {Formatter, TypeScriptToTypeBox} from '@sinclair/typebox-codegen';
import chokidar, {type FSWatcher} from 'chokidar';
import type {Dirent} from 'fs';
import {readFileSync, statSync, writeFileSync} from 'fs';
import {readdir} from 'fs/promises';
import {EventEmitter} from 'node:events';
import {basename, dirname, extname, join, relative, resolve} from 'path';

import layerProxy from './layerProxy.js';
import './watch.log.js';

export interface IWatch {
    start: (realm: IRegistry, remote: IRemote) => Promise<void>;
    test: (tester: unknown) => Promise<void>;
    stop: () => Promise<void>;
    load: <T extends {result: unknown}>(
        config: {name: string; pkg: IModuleConfig['pkg']; base: string},
        isDirectory: boolean,
        isFile: boolean,
        ...path: string[]
    ) => Promise<(api: T) => T>;
}

const isCode = (filename: string): boolean => /(?<!\.d)\.m?(t|j)sx?$/i.test(filename);
const scan = async (...path: string[]): Promise<Dirent[]> =>
    (await readdir(join(...path), {withFileTypes: true})).sort((a, b) =>
        a < b ? -1 : a > b ? 1 : 0,
    );

const emit: EventEmitter = new EventEmitter();

const prefixRE: RegExp = /(?:\d+-)?(.*)/;

interface IConfig {
    enabled: boolean;
    test: string;
    ignored: string[];
    configs: string[];
    logLevel: Parameters<ILog['logger']>[0];
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
    #watchers: FSWatcher[] = [];
    #port: () => unknown;
    #error: IErrorFactory;
    #apiSchema: IApiSchema;

    public constructor(
        config: IConfig,
        {
            error,
            log,
            port,
            apiSchema,
        }: {error: IErrorFactory; log: ILog; port: () => unknown; apiSchema: IApiSchema},
    ) {
        super({log});
        this.merge(this.#config, config);
        this.#port = port;
        this.#error = error;
        this.#apiSchema = apiSchema;
    }

    private async _generate(files: {filename: string; name: string}[], dir: string): Promise<void> {
        const [schema, names] = files.reduce(
            (prev, {filename, name}) => {
                const schema = readFileSync(filename)
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
            [[], []],
        );
        if (schema.length)
            writeFileSync(
                join(dir, '~.schema.ts'),
                Formatter.Format(`/* eslint-disable indent,semi */
            /* eslint-disable @typescript-eslint/naming-convention */
            /* eslint-disable @rushstack/typedef-var */

            import {validationHandlers} from '@feasibleone/blong';
            ${TypeScriptToTypeBox.Generate(schema.sort().join('\n')).trim()}

            export default validationHandlers({
                ${names.sort().join(',\n')}
            });

            declare module '@feasibleone/blong' {
                interface IRemoteHandler {
                    ${names
                        .map(
                            name =>
                                `${name}<T=ReturnType<${name}>>(params: Parameters<${name}>[0], $meta: IMeta): T;`,
                        )
                        .join('\n')}
                }
            }

        `),
            );
    }

    private async _loadHandlers(
        config: {name: string; pkg: IModuleConfig['pkg']; base: string},
        ...path: string[]
    ): Promise<<T>(api: T) => T> {
        const dir = join(...path);
        const handlers = [];
        const validations = [];
        const apis = [];
        const libs = [];
        const handlerFilenames = [];
        let latest = 0;
        const handlerFiles = (await scan(dir))
            .sort()
            .filter(entry => entry.isFile() && isCode(entry.name));
        await this.#apiSchema.generateDir(dir, handlerFiles);
        for (const handlerEntry of handlerFiles) {
            const filename = join(dir, handlerEntry.name);
            if (
                handlerEntry.name === '~.schema.ts' &&
                statSync(filename).mtime.getTime() < latest &&
                handlerFilenames.length
            )
                await this._generate(handlerFilenames, dir);
            if (await this.#apiSchema.generateFile(filename)) continue;
            const item = (await import(filename + '?' + Date.now())).default;
            if (!item) this.log?.error?.('Error loading ' + filename);
            const name =
                !item.name || item.name === 'default'
                    ? basename(filename, extname(filename))
                    : item.name;
            (kind(item) === 'validation'
                ? validations
                : kind(item) === 'api'
                  ? apis
                  : kind(item) === 'lib'
                    ? libs
                    : handlers
            ).push(item);
            if (kind(item) === 'handler') {
                latest = Math.max(latest, statSync(filename).mtime.getTime());
                handlerFilenames.push({name, filename});
            }
        }
        this.#handlerFolders.set(dir, config);
        return api => {
            if (validations.length)
                api[basename(dir) + '.validation'](
                    [...libs, ...validations],
                    config.name + '.' + basename(dir) + '.validation',
                    relative('.', dir),
                );
            if (apis.length)
                api[basename(dir) + '.api'](
                    [...libs, ...apis],
                    config.name + '.' + basename(dir) + '.api',
                    relative('.', dir),
                );
            if (handlers.length)
                api[basename(dir)](
                    [...libs, ...handlers],
                    config.name + '.' + basename(dir),
                    relative('.', dir),
                );
            return api;
        };
    }

    public async load<T extends {result: unknown}>(
        config: {name: string; pkg: IModuleConfig['pkg']; base: string},
        isDirectory: boolean,
        isFile: boolean,
        ...path: string[]
    ): Promise<(api: T) => T> {
        if (isDirectory) {
            return this._loadHandlers(config, ...path);
        } else if (isFile) {
            const filename = join(...path);
            if (isCode(filename)) {
                const item = (await import(filename + '?' + Date.now())).default;
                const itemName =
                    !item.name || item.name === 'default'
                        ? basename(filename, extname(filename)).match(prefixRE)?.[1]
                        : item.name;
                if (kind(item) === 'handler') {
                    this.#handlerFiles.set(filename, config);
                    return Object.defineProperty(
                        api =>
                            api[itemName](
                                [item],
                                config.name + '.' + itemName,
                                relative('.', filename),
                            ),
                        'name',
                        {value: itemName},
                    );
                } else {
                    this.#layerFiles.set(filename, config);
                    return Object.defineProperty(
                        api =>
                            api[itemName](
                                typeof item === 'function' &&
                                    !['adapter', 'orchestrator'].includes(kind(item))
                                    ? item(api)
                                    : item,
                                config.name + '.' + itemName,
                                relative('.', filename),
                            ),
                        'name',
                        {value: itemName},
                    );
                }
            }
        }
    }

    private _watch(registry: IRegistry): void {
        const fsWatcher = chokidar.watch(
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
        this.#watchers.push(fsWatcher);
        fsWatcher.on('error', error => this.log?.error?.(error));
        fsWatcher.on('all', async (event, filename) => {
            try {
                filename = resolve(filename);
                this.log?.info?.(
                    {
                        $meta: {mtid: 'event', method: `watch.reload.${event}`},
                    },
                    filename,
                );
                const layerConfig = this.#layerFiles.get(filename);
                if (layerConfig) {
                    const id = basename(filename, extname(filename));
                    const item = (await this.load(layerConfig, false, true, filename))(
                        layerProxy(this.#error, this.#apiSchema, this.#port, layerConfig),
                    ).result[id];
                    registry.ports.set(layerConfig.name + '.' + id, item.port);
                    const port = await registry.createPort(layerConfig.name + '.' + id);
                    if (!port) return;
                    await port.start();
                    await port.ready();
                    await registry.connected();
                    emit.emit('test');
                } else if (this.#config.configs.includes(filename)) {
                    writeFileSync(join(dirname(import.meta.url.slice(7)), 'watch.log.ts'), '');
                } else {
                    let config = this.#handlerFiles.get(filename);
                    if (config) {
                        const importProxyCallback = await this.load(config, false, true, filename);
                        const name = importProxyCallback.name;
                        await registry.replaceHandlers(
                            config.name + '.' + name,
                            importProxyCallback(
                                layerProxy(this.#error, this.#apiSchema, this.#port, config),
                            ).result[name].methods,
                        );
                    } else {
                        const dir = dirname(filename);
                        config = this.#handlerFolders.get(dir);
                        if (config) {
                            const handlers = (await this._loadHandlers(config, dir))(
                                layerProxy(this.#error, this.#apiSchema, this.#port, config),
                            );
                            await registry.replaceHandlers(
                                config.name + '.' + basename(dir),
                                handlers.result[basename(dir)].methods,
                            );
                            if (handlers.result[basename(dir) + '.validation'])
                                await registry.replaceHandlers(
                                    config.name + '.' + basename(dir) + '.validation',
                                    handlers.result[basename(dir) + '.validation'].methods,
                                );
                        }
                    }
                    await registry.connected();
                    emit.emit('test');
                }
            } catch (error) {
                this.log?.error?.(error);
            }
        });
    }

    public async start(registry: IRegistry, remote: IRemote): Promise<void> {
        this.log?.debug?.({
            $meta: {mtid: 'event', method: 'watch.start'},
            dir: Array.from(this.#handlerFolders.keys())
                .concat(Array.from(this.#handlerFiles.keys()))
                .concat(Array.from(this.#layerFiles.keys()))
                .map(folder => relative('.', folder)),
        });
        if (this.#config.test) {
            emit.on('test', async (done, test) => {
                try {
                    const chain = await (await import('./chain.js')).default(test);

                    const steps = await Promise.all(
                        [].concat(this.#config.test).map(test => remote.remote(test)({}, {})),
                    );
                    await Promise.all(steps.map(chain));
                } catch (error) {
                    this.log?.error?.(error);
                    done?.(error);
                    return;
                }
                done?.();
            });
        }
        if (this.#config.enabled) this._watch(registry);

        await registry.connected();
    }

    public async test(framework: unknown): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            emit.emit('test', error => (error ? reject(error) : resolve()), framework);
        });
    }

    public async stop(): Promise<void> {
        while (this.#watchers.length) {
            const watcher = this.#watchers.pop();
            await watcher.close();
        }
    }
}
