import { internal, type TypedError } from '../types.js';
import type { Log } from './Log.js';
import type { meta } from './adapter.js';
import utError from './error.js';

export interface ErrorFactory {
    register: <T>(errors: T) => Record<keyof T, (params?: unknown, $meta?: meta) => TypedError>
    get: (name?: string) => Record<string, (params?: unknown, $meta?: meta) => TypedError>
    fetch: (type?: string) => unknown
    define: (id, superType, message) => unknown
}

export default class ErrorFactoryImpl extends internal implements ErrorFactory {
    #error: ReturnType<typeof utError>;
    #config = {
        logLevel: 'debug',
        errorPrint: ''
    };

    constructor(config: {logLevel: Parameters<Log['logger']>[0], errorPrint: string}, {log}: {log: Log}) {
        super();
        this.merge(this.#config, config);
        this.#error = utError({
            logFactory: {
                createLog: (logLevel, bindings) => log?.logger(logLevel, bindings) || {}
            },
            logLevel: this.#config.logLevel,
            errorPrint: this.#config.errorPrint
        });
    }

    register(errors) {
        return this.#error.register(errors);
    }

    get(name) {
        return this.#error.get(name);
    }

    fetch(type) {
        return this.#error.fetch(type);
    }

    define(id, superType, message) {
        return this.#error.define(id, superType, message);
    }
}
