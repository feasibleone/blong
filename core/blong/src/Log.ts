import { LoggerOptions, pino, type Level, type LogFn, type Logger } from 'pino';
import { Internal } from '../types.js';

export interface ILog {
    logger: (level: Level, bindings: object) => {
        trace?: LogFn
        debug?: LogFn
        info?: LogFn
        warn?: LogFn
        error?: LogFn
        fatal?: LogFn
    }
    child: Logger['child']
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
                    'msg'
                ].map(item => `{if ${item}}{${item}} {end}`).join(''),
                ignore: [
                    'context',
                    'pid',
                    'hostname',
                    '$meta',
                    'res.statusCode',
                    'req.method',
                    'req.hostname',
                    'req.url'
                ].join(',')
            }
        }
    };

    public constructor(config: LoggerOptions) {
        super();
        this.merge(this.#config, config);
        this.#logger = pino(this.#config);
    }

    public child(...params: Parameters<Logger['child']>): ReturnType<Logger['child']> {
        return this.#logger.child(...params);
    }

    public logger(level: LoggerOptions['level'] = this.#config.level, bindings: object): ReturnType<ILog['logger']> {
        const child = this.#logger.child(bindings, {level});
        const result = {
            trace: null,
            debug: null,
            info: null,
            warn: null,
            error: null,
            fatal: null
        };
        switch (level) {
            case 'trace': result.trace = child.trace.bind(child);
            case 'debug': result.debug = child.debug.bind(child); // eslint-disable-line no-fallthrough
            case 'info': result.info = child.info.bind(child); // eslint-disable-line no-fallthrough
            case 'warn': result.warn = child.warn.bind(child); // eslint-disable-line no-fallthrough
            case 'error': result.error = child.error.bind(child); // eslint-disable-line no-fallthrough
            case 'fatal': result.fatal = child.fatal.bind(child); // eslint-disable-line no-fallthrough
        }
        return result;
    }
}
