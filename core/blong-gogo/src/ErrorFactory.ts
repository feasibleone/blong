import type {IErrorFactory, ILog, IMeta, ITypedError} from '@feasibleone/blong/types';
import {Internal} from '@feasibleone/blong/types';

import Errors from './error.ts';

interface IConfig {
    logLevel: Parameters<ILog['logger']>[0];
    errorPrint: string;
}
export default class ErrorFactory extends Internal implements IErrorFactory {
    #error: ReturnType<typeof Errors>;
    #config: IConfig = {
        logLevel: 'debug',
        errorPrint: '',
    };

    public constructor(config: IConfig, {log}: {log: ILog}) {
        super({log});
        this.merge(this.#config, config);
        this.#error = Errors({
            logFactory: {
                createLog: (...params: Parameters<ILog['logger']>) => log?.logger(...params) || {},
            } as unknown as Parameters<typeof Errors>[0]['logFactory'],
            logLevel: this.#config.logLevel,
            errorPrint: this.#config.errorPrint,
        });
    }

    public register<T>(
        errors: T,
    ): Record<keyof T, (params?: unknown, $meta?: IMeta) => ITypedError> {
        return this.#error.register(errors);
    }

    public get(name: string) {
        return this.#error.get(name);
    }

    public fetch(type: string): object {
        return this.#error.fetch(type);
    }

    public define(
        id: string,
        superType: string | {type: string},
        message: string,
    ): (params?: unknown, $meta?: IMeta) => ITypedError {
        return this.#error.define(id, superType, message);
    }
}
