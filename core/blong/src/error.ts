import type { IMeta, ITypedError } from '../types.js';

const typeRegex: RegExp = /^[a-z]\w*(\.!?\w+)*$/;
const paramsRegex: RegExp = /\{([^}]*)\}/g;

const interpolate = (string: string, params = {}): string => {
    return string.replace(paramsRegex, (placeholder, label) => {
        return typeof params[label] === 'undefined' ? `?${label}?` : params[label];
    });
};
const getWarnHandler = ({logFactory, logLevel}): (msg: unknown, context: {method: string, args: unknown}) => void => {
    if (logFactory) {
        const log = logFactory.createLog(logLevel, {name: 'utError', context: 'utError'});
        if (log.warn) {
            return (msg, context) => {
                const e = new Error();
                log.warn(msg, {
                    $meta: {
                        mtid: 'deprecation',
                        method: context.method
                    },
                    args: context.args,
                    error: {
                        type: 'utError.deprecation',
                        stack: e.stack.split('\n').splice(3).join('\n')
                    }
                });
            };
        }
    }
    return () => {};
};

export interface IErrorFactory {
    get(type?: string): unknown;
    fetch(type: string): object;
    define(id: string, superType: string | { type: string; }, message: string): (params?: unknown, $meta?: IMeta) => ITypedError;
    register<T>(errorsMap: T): Record<keyof T, (params?: unknown, $meta?: IMeta) => ITypedError>;
}

export interface IErrorMap {
    [name: string]: string | {
        message: string
        print?: string
        statusCode?: number
    }
}

export default ({logFactory, logLevel, errorPrint}): IErrorFactory => {
    const warn = getWarnHandler({logFactory, logLevel});
    const errors = {};
    const api = {
        get(type: string) {
            return type ? errors[type] : errors;
        },
        fetch(type: string) {
            const result = {};
            Object.keys(errors).forEach(key => {
                if (key.startsWith(type)) {
                    result[key] = errors[key];
                }
            });
            return result;
        },
        define(id: string, superType: string | {type: string}, message: string) {
            const type = [
                superType
                    ? typeof superType === 'string'
                        ? superType
                        : superType.type
                    : null,
                id
            ].filter(x => x).join('.');
            return api.register({[type]: message})[type];
        },
        register<T>(errorsMap: T) : Record<keyof T, (params?: unknown, $meta?: IMeta) => ITypedError> {
            const result = {} as Record<keyof T, (params?: unknown, $meta?: IMeta) => ITypedError>;
            Object.entries(errorsMap).forEach(([type, message]) => {
                if (!typeRegex.test(type)) {
                    warn?.(`Invalid error type format: '${type}'!`, {
                        args: {type, expectedFormat: typeRegex.toString()},
                        method: 'utError.register'
                    });
                }
                const props = typeof message === 'string'
                    ? {message, print: undefined}
                    : Array.isArray(message)
                        ? {message: message[0], print: message[1]}
                        : message;
                if (!props.message) throw new Error(`Missing message for error '${type}'`);
                const error = errors[type];
                if (error) {
                    if (error.message !== props.message) {
                        throw new Error(`Error '${type}' is already defined with different message!`);
                    }
                    result[type] = error;
                    return;
                }

                if (!props.print && errorPrint) props.print = typeof errorPrint === 'string' ? errorPrint : props.message;

                const handler = (params = {params: undefined}, $meta): ITypedError | ITypedError[] => {
                    const error = new Error() as ITypedError;
                    if (params instanceof Error) {
                        error.cause = params;
                    } else {
                        Object.assign(error, params);
                    }
                    Object.assign(error, props);
                    Object.defineProperty(error, 'name', {value: type, configurable: true, enumerable: false});
                    error.type = type;
                    if (props.print) error.print = props.print;
                    error.message = interpolate(props.message, params.params);
                    return $meta ? [error] : error; // to do - fix once bus.register allows to configure unpack
                };
                handler.type = type;
                handler.message = props.message;
                if (props.print) handler.print = props.print;
                handler.params = handler.message.match(paramsRegex)?.map(param => param.substring(1, param.length - 1));
                result[type] = errors[type] = handler;
            });
            return result;
        }
    };
    return api;
};
