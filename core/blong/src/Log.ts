import {LoggerOptions, pino, type Level, type Logger} from 'pino';
import {Internal, type ILogger} from '../types.js';

export interface ILog {
    logger: (level: Level, bindings: object) => ILogger;
    child: Logger['child'];
}

export default class Log extends Internal implements ILog {
    #logger: Logger;
    #config: LoggerOptions = {
        level: 'info',
        transport: {
            target: 'pino-pretty',
            options: {
                singleLine: true,
                colorizeObjects: true,
                messageFormat: [
                    'context',
                    'req.method',
                    'req.hostname',
                    'req.url',
                    'res.statusCode',
                    '$meta.mtid',
                    '$meta.method',
                    'msg',
                ]
                    .map(item => `{if ${item}}{${item}} {end}`)
                    .join(''),
                ignore: [
                    'context',
                    'pid',
                    'hostname',
                    '$meta',
                    'res.statusCode',
                    'req.method',
                    'req.hostname',
                    'req.url',
                ].join(','),
            },
        },
    };

    public constructor(config: LoggerOptions) {
        super();
        this.merge(this.#config, config);
        this.#logger = pino(this.#config);
    }

    public child(...params: Parameters<Logger['child']>): ReturnType<Logger['child']> {
        return this.#logger.child(...params);
    }

    public logger(
        level: LoggerOptions['level'] = this.#config.level,
        bindings: object
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
