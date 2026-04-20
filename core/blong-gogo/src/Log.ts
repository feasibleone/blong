import {Internal, type ILog} from '@feasibleone/blong/types';
import {pino, type Logger, type LoggerOptions} from 'pino';
import {monotonicFactory} from 'ulidx';
import type {CacacheTransportOptions} from './pino-cacache.js';

// echo -e "\u001B]8;;https://google.com\u001B\\Кликни тук\u001B]8;;\e\\"

export interface LogConfig extends LoggerOptions {
    /** When provided, log entries are cached to disk via cacache for later inspection. */
    cacache?: CacacheTransportOptions;
}

const ulid = monotonicFactory();

const PRETTY_TRANSPORT = {
    target: './pino-pretty.ts',
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
        this.#config.mixin = () => ({id: ulid()});

        if (this.#config.cacache) {
            // Multi-target transport: pretty console + cacache storage
            const cacacheOptions = this.#config.cacache;
            this.#config.transport = {
                targets: [
                    PRETTY_TRANSPORT,
                    {
                        target: './pino-cacache.ts',
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
        const result = {
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
            case 'debug': // eslint-disable-line no-fallthrough
                result.debug = child.debug.bind(child);
            case 'info': // eslint-disable-line no-fallthrough
                result.info = child.info.bind(child);
            case 'warn': // eslint-disable-line no-fallthrough
                result.warn = child.warn.bind(child);
            case 'error': // eslint-disable-line no-fallthrough
                result.error = child.error.bind(child);
            case 'fatal': // eslint-disable-line no-fallthrough
                result.fatal = child.fatal.bind(child);
        }
        return result;
    }
}
