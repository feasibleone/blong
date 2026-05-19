import {Internal, type ILog, type ILogger} from '@feasibleone/blong/types';
import {pino, type LogFn, type Logger, type LoggerOptions} from 'pino';
import {monotonicFactory} from 'ulidx';
import type {CacacheTransportOptions} from './pino-cacache.js';

// echo -e "\u001B]8;;https://google.com\u001B\\Кликни тук\u001B]8;;\e\\"

export interface LogConfig extends LoggerOptions {
    /** When provided, log entries are cached to disk via cacache for later inspection. */
    cacache?: CacacheTransportOptions;
}

const ulid = monotonicFactory();

const ignoreArgPatterns = [
    '--tls-cipher-list=',
    '--v8-pool-size=',
    '--trace-event-file-pattern=',
    '--secure-heap-min=',
    '--node-snapshot',
    '--use-largepages=',
    '--secure-heap=',
    '--stack-trace-limit=',
];
// Pino transports run in worker threads. When the entry-point is ESM,
// `require.main` is undefined in CommonJS modules (including pino's transport
// loader). Pino interprets this as a "preload phase" and resets the worker's
// execArgv to [], stripping the TypeScript loader.  We work around this by
// explicitly forwarding process.execArgv so the TypeScript loader is available
// inside the transport worker thread.
const WORKER_OPTS = {
    execArgv: process.execArgv.filter(
        arg => !ignoreArgPatterns.some(pattern => arg.startsWith(pattern)),
    ),
};

const PRETTY_TRANSPORT = {
    target: './pino-pretty.ts',
    worker: WORKER_OPTS,
    options: {
        singleLine: true,
        colorizeObjects: true,
        ignore: [
            'context',
            'prefix',
            'pid',
            'hostname',
            '$meta.mtid',
            '$meta.method',
            'req',
            'res',
            'config',
            'configBase',
            'id',
        ].join(','),
    },
};

export default class Log extends Internal implements ILog {
    #logger: Logger;
    #config: LogConfig = {
        level: 'info',
        transport: PRETTY_TRANSPORT,
    };

    public constructor(config: LogConfig) {
        super();
        this.merge(this.#config, config);

        // Inject a monotonic ULID `id` into every log entry before it reaches any transport

        if (this.#config.cacache) {
            this.#config.mixin = () => ({id: ulid()});
            // Multi-target transport: pretty console + cacache storage
            const cacacheOptions = this.#config.cacache;
            this.#config.transport = {
                targets: [
                    PRETTY_TRANSPORT,
                    {
                        target: './pino-cacache.ts',
                        worker: WORKER_OPTS,
                        options: cacacheOptions,
                    },
                ],
            };
        }

        // Remove the cacache option before passing to pino — it is not a pino option
        const {cacache: _cacacheConfig, ...pinoConfig} = this.#config;
        this.#logger = pino(pinoConfig);
    }

    public child<T extends string>(...params: Parameters<Logger<never>['child']>): Logger<T> {
        return this.#logger.child(...params) as Logger<T>;
    }

    public logger(
        level: LoggerOptions['level'] = this.#config.level,
        bindings: object,
    ): ReturnType<ILog['logger']> {
        const child = this.#logger.child(bindings, {level});
        const result: Record<keyof ILogger, LogFn | null> = {
            trace: null,
            debug: null,
            info: null,
            warn: null,
            error: null,
            fatal: null,
        };
        switch (level) {
            case 'trace':
                result.trace = child.trace.bind(child);
            case 'debug':
                result.debug = child.debug.bind(child);
            case 'info':
                result.info = child.info.bind(child);
            case 'warn':
                result.warn = child.warn.bind(child);
            case 'error':
                result.error = child.error.bind(child);
            case 'fatal':
                result.fatal = child.fatal.bind(child);
        }
        return result as unknown as ILogger;
    }
}
