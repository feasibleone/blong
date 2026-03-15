import {Internal, type ILog} from '@feasibleone/blong/types';
import {pino, type Logger, type LoggerOptions} from 'pino';

// echo -e "\u001B]8;;https://google.com\u001B\\Кликни тук\u001B]8;;\e\\"
export default class Log extends Internal implements ILog {
    #logger: Logger;
    #config: LoggerOptions = {
        level: 'info',
        transport: {
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
                ].join(','),
            },
        },
    };

    public constructor(config: LoggerOptions) {
        super();
        this.merge(this.#config, config);
        this.#logger = pino(this.#config);
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
