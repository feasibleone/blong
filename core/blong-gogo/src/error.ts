import type {IApi, IErrorFactory, ILog, IMeta, ITypedError} from '@feasibleone/blong/types';

import {frameworkSignalRegistry} from './frameworkSignals.ts';
import {signalView, writeThroughFace, type ISignalHost} from './signals.ts';

const typeRegex: RegExp = /^[$a-z]\w*(\.!?\w+)*$/;
const paramsRegex: RegExp = /\{([^}]*)\}/g;

const interpolate = (string: string, params: Record<string, string> = {}): string => {
    return string.replace(paramsRegex, (placeholder, label) => {
        return typeof params[label] === 'undefined' ? `?${label}?` : params[label];
    });
};
const getWarnHandler = ({
    logFactory,
    logLevel,
}: {
    logFactory?: IApi;
    logLevel: Parameters<ILog['logger']>[0];
}): ((msg: string | undefined, context: {method: string; args: unknown}) => void) => {
    if (logFactory) {
        const log = logFactory.createLog(logLevel, {name: 'utError', context: 'utError'});
        if (log.warn) {
            // A declared identifier rather than a level call, so the notice has a name an operator
            // can silence on its own — and written through this component's own face, which is what
            // keeps `utError` as the context of the line.
            const {vocabulary} = signalView(
                frameworkSignalRegistry(),
                writeThroughFace(log as unknown as ISignalHost['log']),
            );
            return (msg, context) => {
                const e = new Error();
                vocabulary.frameworkErrorDeprecated?.({
                    reason: msg ?? 'the definition was not accepted',
                    method: context.method,
                    type: 'utError.deprecation',
                    args: context.args,
                    stack: e.stack?.split('\n').splice(3).join('\n'),
                });
            };
        }
    }
    return () => {};
};

export default ({
    logFactory,
    logLevel,
    errorPrint,
}: {
    logFactory?: IApi;
    logLevel: Parameters<ILog['logger']>[0];
    errorPrint?: string | boolean;
}): IErrorFactory => {
    const warn = getWarnHandler({logFactory, logLevel});
    const errors: Record<string | symbol, {message: string; print?: string} | string> = {
        source: '',
    };
    // Mapping from lowercase no-dot keys to original error keys for case-insensitive lookup
    const errorLookup: Record<string, string> = {};

    // Create the proxy once upfront for reuse
    const errorsProxy = new Proxy(errors, {
        get(target, prop: string | symbol) {
            if (typeof prop === 'symbol') return target[prop];

            // First try direct access (backwards compatibility with dot notation)
            if (prop in target) return target[prop];

            // Convert property to lowercase without dots for lookup
            let lookupKey = prop.toLowerCase();

            // Remove 'error' prefix if present (e.g., errorReleaseJobTrigger -> releasjobtrigger)
            if (lookupKey.startsWith('error')) {
                lookupKey = lookupKey.substring(5);
            }

            // Try to find matching error
            const originalKey = errorLookup[lookupKey];
            if (originalKey && target[originalKey]) {
                return target[originalKey];
            }

            // Throw error for non-existent properties to catch typos during destructuring
            const availableErrors = Object.keys(target).sort().join(', ');
            throw new Error(
                `Error '${String(prop)}' not found. Available errors: ${availableErrors}`,
            );
        },
        has(target, prop: string | symbol) {
            if (typeof prop === 'symbol') return prop in target;

            // Check direct access first
            if (prop in target) return true;

            // Check via lookup
            let lookupKey = prop.toLowerCase();
            if (lookupKey.startsWith('error')) {
                lookupKey = lookupKey.substring(5);
            }
            return lookupKey in errorLookup;
        },
        ownKeys(target) {
            // Return all original keys plus generated error* keys
            const keys = Object.keys(target);
            const additionalKeys = keys.map(key => {
                // Convert 'release.jobTrigger' to 'errorReleaseJobTrigger'
                const parts = key.split('.');
                const camelCased = parts
                    .map((part, idx) =>
                        idx === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1),
                    )
                    .join('');
                return 'error' + camelCased.charAt(0).toUpperCase() + camelCased.slice(1);
            });
            return [...keys, ...additionalKeys];
        },
        getOwnPropertyDescriptor(target, prop: string | symbol) {
            if (typeof prop === 'symbol') {
                return Object.getOwnPropertyDescriptor(target, prop);
            }

            // Check both direct and via lookup
            if (prop in target || this.has!(target, prop)) {
                return {
                    enumerable: true,
                    configurable: true,
                };
            }
            return undefined;
        },
    });

    const api = {
        get(type: string) {
            return type ? errors[type] : errorsProxy;
        },
        fetch(type: string) {
            const result = {} as Record<string, string | {message: string; print?: string}>;
            Object.keys(errors).forEach(key => {
                if (key.startsWith(type)) {
                    result[key] = errors[key];
                }
            });
            return result;
        },
        define(id: string, superType: string | {type: string}, message: string) {
            const type = [
                superType ? (typeof superType === 'string' ? superType : superType.type) : null,
                id,
            ]
                .filter(x => x)
                .join('.');
            return api.register({[type]: message})[type];
        },
        register<T extends Record<string, string | {message: string; print?: string}>>(
            errorsMap: T,
        ): Record<keyof T, (params?: unknown, $meta?: IMeta) => ITypedError> {
            const result = {} as Record<keyof T, (params?: unknown, $meta?: IMeta) => ITypedError>;
            Object.entries(errorsMap).forEach(([type, message]) => {
                if (!typeRegex.test(type)) {
                    warn?.(`Invalid error type format: '${type}'!`, {
                        args: {type, expectedFormat: typeRegex.toString()},
                        method: 'utError.register',
                    });
                }
                const props: {message: string; print?: string} =
                    typeof message === 'string'
                        ? {message, print: undefined}
                        : Array.isArray(message)
                          ? {message: message[0], print: message[1]}
                          : message;
                if (!props.message) throw new Error(`Missing message for error '${type}'`);
                const error = errors[type] as {message?: string; print?: string} | undefined;
                if (error) {
                    if (error.message !== props.message) {
                        throw new Error(
                            `Error '${type}' is already defined with different message!`,
                        );
                    }
                    (result as Record<string, (params?: unknown, $meta?: IMeta) => ITypedError>)[
                        type
                    ] = error as unknown as (params?: unknown, $meta?: IMeta) => ITypedError;
                    return;
                }

                if (!props.print && errorPrint)
                    props.print = typeof errorPrint === 'string' ? errorPrint : props.message;

                const handler = (
                    params = {params: undefined},
                    $meta: unknown,
                ): ITypedError | ITypedError[] => {
                    const error = new Error() as ITypedError;
                    if (params instanceof Error) {
                        error.cause = params;
                    } else {
                        Object.assign(error, params);
                    }
                    Object.assign(error, props);
                    Object.defineProperty(error, 'name', {
                        value: type,
                        configurable: true,
                        enumerable: false,
                    });
                    error.type = type;
                    // A declared message is interpolated from the values the call *supplies*, and a
                    // realm declares them the way lukaot takes them — beside each other, not inside a
                    // `params` bag. Reading only `params.params` left every declared message a
                    // template with `?name?` in it on this path, which is the hole the move out of
                    // `error/error.ts` was meant to close (`@@T-718`).
                    const values = (params.params ?? params ?? {}) as unknown as Record<
                        string,
                        string
                    >;
                    if (props.print) error.print = interpolate(props.print, values);
                    error.message = interpolate(props.message, values);
                    return $meta ? [error] : error; // to do - fix once bus.register allows to configure unpack
                };
                handler.type = type;
                handler.message = props.message;
                if (props.print) handler.print = props.print;
                handler.params = handler.message
                    .match(paramsRegex)
                    ?.map(param => param.substring(1, param.length - 1));
                (result as Record<string, unknown>)[type] = (errors as Record<string, unknown>)[
                    type
                ] = handler;

                // Add to lookup map (lowercase, no dots)
                const lookupKey = type.toLowerCase().replace(/\./g, '');
                errorLookup[lookupKey] = type;
            });
            return result;
        },
    };
    return api as IErrorFactory;
};
