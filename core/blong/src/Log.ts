import {pino, type Level, type LogFn, type Logger } from 'pino';
import { internal } from '../types.js';

export interface Log {
    logger: (level: Level, bindings: object) => {
        trace?: LogFn
        debug?: LogFn
        info?: LogFn
        warn?: LogFn
        error?: LogFn
        fatal?: LogFn
    }
    child: (bindings?: object, options?: object) => Logger
}

export default class LogImpl extends internal implements Log {
    #logger: Logger;
    #config = {
        level: 'info' as Level,
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

    constructor(config) {
        super();
        this.merge(this.#config, config);
        this.#logger = pino(this.#config);
    }

    child(bindings, options) {
        return this.#logger.child(bindings, options);
    }

    logger(level: Level = this.#config.level, bindings: object) {
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
