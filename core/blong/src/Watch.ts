import { Formatter, TypeScriptToTypeBox } from '@sinclair/typebox-codegen';
import chokidar from 'chokidar';
import { readFileSync, statSync, writeFileSync } from 'fs';
import { readdir } from 'fs/promises';
import { EventEmitter } from 'node:events';
import { basename, dirname, extname, join, relative, resolve } from 'path';

import { internal, kind, type config } from '../types.js';
import type { ErrorFactory } from './ErrorFactory.js';
import type { Log } from './Log.js';
import type { Registry } from './Registry.js';
import type { Remote } from './Remote.js';
import chain from './chain.js';
import layerProxy from './layerProxy.js';
import './watch.log.js';

export interface Watch {
    start: (realm: Registry, remote: Remote) => Promise<void>
    stop: () => Promise<void>
    load: <T>(config: {name: string, pkg: config['pkg']}, isDirectory: boolean, isFile: boolean, ...path: string[]) => Promise<(api: T) => T>
}

const isCode = (filename: string) => /(?<!\.d)\.m?(t|j)sx?$/i.test(filename);
const scan = async(...path: string[]) => (await readdir(join(...path), {withFileTypes: true})).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);

const emit = new EventEmitter();

export default class WatchImpl extends internal implements Watch {
    #config = {
        test: '',
        ignored: [],
        configs: [],
        logLevel: 'debug' as Parameters<Log['logger']>[0]
    };

    #logger: ReturnType<Log['logger']>;
    #handlerFolders = new Map<string, {name: string, pkg: config['pkg']}>();
    #handlerFiles = new Map<string, {name: string, pkg: config['pkg']}>();
    #layerFiles = new Map<string, {name: string, pkg: config['pkg']}>();
    #watchers: chokidar.FSWatcher[] = [];
    #port: unknown;
    #error: ErrorFactory;

    constructor(config, {error, log, port}: {error: ErrorFactory, log: Log, port: unknown}) {
        super();
        this.merge(this.#config, config);
        this.#port = port;
        this.#error = error;
        this.#logger = log?.logger(this.#config.logLevel, {name: 'realm'});
    }

    async generate(files, dir) {
        const [schema, names] = files.reduce((prev, {filename, name}) => {
            const schema = readFileSync(filename)
                .toString()
                .match(/^interface schema \{\n(?:[^}]?.*\n)*}$/m)
                ?.[0];
            return schema ? [[...prev[0], schema.replace('interface schema {', `interface ${name} {`)], [...prev[1], name]] : prev;
        }, [[], []]);
        schema.length && writeFileSync(join(dir, '~.schema.ts'), Formatter.Format(`/* eslint-disable indent,semi */
            import { validation } from '@feasibleone/blong';
            ${TypeScriptToTypeBox.Generate(schema.sort().join('\n')).trim()}

            export default validation(() => ({
                ${names.sort().map(name => `${name}: () => ${name}.properties`).join(',\n    ')}
            }));
        `));
    }

    async loadHandlers(config, ...path: string[]) {
        const dir = join(...path);
        const handlers = [];
        const validations = [];
        const handlerFilenames = [];
        let latest = 0;
        for (const handlerEntry of (await scan(dir)).sort()) {
            if (handlerEntry.isFile() && isCode(handlerEntry.name)) {
                const filename = join(dir, handlerEntry.name);
                if (
                    handlerEntry.name === '~.schema.ts' &&
                    statSync(filename).mtime.getTime() < latest &&
                    handlerFilenames.length
                ) this.generate(handlerFilenames, dir);
                const item = (await import(filename + '?' + Date.now())).default;
                const name = (!item.name || item.name === 'default') ? basename(filename, extname(filename)) : item.name;
                (kind(item) === 'validation' ? validations : handlers).push(item);
                if (kind(item) === 'handler') {
                    latest = Math.max(latest, statSync(filename).mtime.getTime());
                    handlerFilenames.push({name, filename});
                }
            }
        }
        this.#handlerFolders.set(dir, config);
        return api => {
            if (validations.length) api[basename(dir) + '.validation'](validations, config.name + '.' + basename(dir) + '.validation', relative('.', dir));
            if (handlers.length) api[basename(dir)](handlers, config.name + '.' + basename(dir), relative('.', dir));
            return api;
        };
    }

    async load(config: {name: string, pkg: config['pkg']}, isDirectory: boolean, isFile: boolean, ...path: string[]) {
        if (isDirectory) {
            return this.loadHandlers(config, ...path);
        } else if (isFile) {
            const filename = join(...path);
            if (isCode(filename)) {
                const item = (await import(filename + '?' + Date.now())).default;
                const itemName = (!item.name || item.name === 'default') ? basename(filename, extname(filename)) : item.name;
                if (kind(item) === 'handler') {
                    this.#handlerFiles.set(filename, config);
                    return Object.defineProperty(
                        api => api[itemName](
                            [item],
                            config.name + '.' + itemName,
                            relative('.', filename)
                        ),
                        'name',
                        {value: itemName}
                    );
                } else {
                    this.#layerFiles.set(filename, config);
                    return Object.defineProperty(
                        api => api[itemName](
                            (typeof item === 'function' && kind(item) !== 'adapter') ? item(api) : item,
                            config.name + '.' + itemName,
                            relative('.', filename)
                        ),
                        'name',
                        {value: itemName}
                    );
                }
            }
        }
    }

    async start(registry: Registry, remote: Remote) {
        this.#logger?.debug?.({
            $meta: {mtid: 'event', method: 'watch.start'},
            dir: Array
                .from(this.#handlerFolders.keys())
                .concat(Array.from(this.#handlerFiles.keys()))
                .concat(Array.from(this.#layerFiles.keys()))
                .map(folder => relative('.', folder))
        });
        if (this.#config.test) {
            emit.on('test', async() => {
                try {
                    const steps = await Promise.all([].concat(this.#config.test).map(test => remote.remote(test)({}, {})));
                    await Promise.all(steps.map(chain));
                } catch (error) {
                    this.#logger?.error?.(error);
                }
            });
        }

        const fsWatcher = chokidar.watch(
            Array.from(this.#handlerFolders.keys()).map(folder => [`${folder}/*.ts`, `${folder}/*.yaml`, `${folder}/*.sql`, `${folder}/*.html`]).flat()
                .concat(Array.from(this.#handlerFiles.keys()))
                .concat(Array.from(this.#layerFiles.keys()))
                .concat(this.#config.configs),
            {
                cwd: '.',
                ignoreInitial: true,
                ignored: ['.git/**', 'node_modules/**', 'dist/**', ...(this.#config.ignored || [])]
            });
        this.#watchers.push(fsWatcher);
        fsWatcher.on('error', error => this.#logger?.error?.(error));
        fsWatcher.on('all', async(event, filename) => {
            try {
                filename = resolve(filename);
                this.#logger?.info?.({
                    $meta: {mtid: 'event', method: `watch.reload.${event}`}
                }, filename);
                const layerConfig = this.#layerFiles.get(filename);
                if (layerConfig) {
                    const id = basename(filename, extname(filename));
                    const item = (await this.load(layerConfig, false, true, filename))(layerProxy(this.#error, this.#port, layerConfig)).result[id];
                    registry.ports.set(layerConfig.name + '.' + id, item.port);
                    const port = await registry.createPort(layerConfig.name + '.' + id);
                    if (!port) return;
                    await port.start();
                    await port.ready();
                    await registry.connected();
                    emit.emit('test');
                } else if (this.#config.configs.includes(filename)) {
                    writeFileSync(join(dirname(import.meta.url.slice(5)), 'watch.log.ts'), '');
                } else {
                    let config = this.#handlerFiles.get(filename);
                    if (config) {
                        const importProxyCallback = await this.load(config, false, true, filename);
                        const name = importProxyCallback.name;
                        await registry.replaceHandlers(config.name + '.' + name, importProxyCallback(layerProxy(this.#error, this.#port, config)).result[name].methods);
                    } else {
                        const dir = dirname(filename);
                        config = this.#handlerFolders.get(dir);
                        if (config) {
                            await registry.replaceHandlers(config.name + '.' + basename(dir), (await this.loadHandlers(config, dir))(layerProxy(this.#error, this.#port, config)).result[basename(dir)].methods);
                        }
                    }
                    await registry.connected();
                    emit.emit('test');
                }
            } catch (error) {
                this.#logger?.error?.(error);
            }
        });
        await registry.connected();
        emit.emit('test');
    }

    async stop() {
        while (this.#watchers.length) {
            const watcher = this.#watchers.pop();
            await watcher.close();
        }
    }
}
