import type {
    Errors,
    IErrorFactory,
    IErrorMap,
    ILocal,
    ILog,
    IMeta,
    IRemote,
    ITypedError,
    RemoteMethod,
} from '@feasibleone/blong';
import {Internal} from '@feasibleone/blong';
import hrtime from 'browser-process-hrtime';

const errorMap: IErrorMap = {
    'remote.bindingFailed': 'Method binding failed for {typeName} {methodType} {methodName}',
    'remote.cacheFailed': 'Method cache failed for {typeName} {methodType} {methodName}',
    'remote.cacheOperationMissing':
        'Cache before and after operations missing for {typeName} {methodType} {methodName}',
    'remote.noMeta': '$meta not passed to method: {method}',
    'remote.timeout': 'Method {method} timed out',
};

export default class Remote extends Internal implements IRemote {
    #config: {
        canSkipSocket: boolean;
        requireMeta: 'trace' | 'debug' | 'warn' | 'error' | 'fatal' | 'info' | true;
    } = {
        canSkipSocket: false,
        requireMeta: true,
    };

    #importCache: object = {};
    #requireMeta: (method: string) => void;
    #errors: Errors<typeof errorMap>;
    #local: ILocal;

    #brokerRequest: RemoteMethod;
    #brokerPublish: RemoteMethod;

    public constructor(
        config: {logLevel?: Parameters<ILog['logger']>[0]},
        {log, error, local}: {log: ILog; error: IErrorFactory; local: ILocal}
    ) {
        super({log});
        config = this.merge(this.#config, config);
        this.#local = local;
        this.#errors = error.register(errorMap);
        switch (this.#config.requireMeta) {
            case 'trace':
            case 'debug':
            case 'info':
            case 'warn': {
                this.#requireMeta = method =>
                    this.log?.[this.#config.requireMeta.toString()]?.(
                        this.#errors['remote.noMeta']({params: {method}})
                    );
                break;
            }
            case 'error':
            case 'fatal':
            case true: {
                const logLevel =
                    this.#config.requireMeta === true ? 'error' : this.#config.requireMeta;
                this.#requireMeta = method => {
                    const error = this.#errors['remote.noMeta']({params: {method}});
                    this.log?.[logLevel]?.(error);
                    throw error;
                };
                break;
            }
            default:
                this.#requireMeta = null;
                break;
        }
        this.#brokerRequest = this._getMethod('req', 'request', undefined, {returnMeta: true});
        this.#brokerPublish = this._getMethod('pub', 'publish', undefined, {returnMeta: true});
    }

    protected gateway(meta: object, method: string): object | void {}

    protected sender(methodType: 'request' | 'publish', typeName: 'req' | 'pub'): unknown {
        return async (...rest) => {
            const $meta = rest.pop();
            throw this.#errors['remote.bindingFailed']({
                params: {
                    methodName: $meta.method,
                    methodType,
                    typeName,
                },
            });
        };
    }

    public remote(methodName: string, options: {method?: string; timeout?: number}): RemoteMethod {
        methodName = options?.method || methodName;
        let result; // = !options && this.#importCache[methodName];

        const startRetry = (
            fn,
            {timeout, retry}: {timeout?: number; retry?: number}
        ): Promise<unknown> => {
            return new Promise((resolve, reject) => {
                const attempt = (): void =>
                    fn()
                        .then(resolve)
                        .catch(error => {
                            // todo maybe log these errors
                            if (Date.now() > timeout) {
                                if (error) error.params = {method: 'methodName'};
                                reject(this.#errors['remote.timeout'](error));
                            } else {
                                setTimeout(attempt, retry);
                            }
                        });
                attempt();
            });
        };

        if (!result) {
            const method = this._getMethod('req', 'request', methodName, options);
            result = Object.assign(function (...params: unknown[]) {
                const $meta = params.length > 1 && (params[params.length - 1] as IMeta);
                if ($meta && $meta.timeout && $meta.retry) {
                    return startRetry(() => method(...params), $meta);
                } else {
                    return method(...params);
                }
            }, method);
            if (!options) this.#importCache[methodName] = result;
            Object.defineProperty(result, 'name', {
                value: methodName,
                configurable: true,
                enumerable: false,
            });
        }

        return result;
    }

    private _getMethod(
        typeName: 'req' | 'pub',
        methodType: 'request' | 'publish',
        methodName: string,
        options: {
            fallback?: boolean;
            returnMeta?: boolean;
            timeout?: number;
            cache?: IMeta['cache'];
        }
    ): RemoteMethod {
        let fn = null;
        let unpack = true;
        const fallback = options && options.fallback;
        const timeoutSec = options && options.timeout && Math.floor(options.timeout / 1000);
        const timeoutNSec = options && options.timeout && (options.timeout % 1000) * 1000000;
        let fnCache = null;
        const cache = options && options.cache;

        const busMethod: RemoteMethod = async (...params) => {
            const $meta = (params.length > 1 && params[params.length - 1]) as IMeta;
            let $applyMeta;
            if (!$meta) {
                this.#requireMeta?.(methodName);
                params.push(($applyMeta = {method: methodName}));
            } else {
                $applyMeta = params[params.length - 1] = {
                    ...$meta,
                    ...($meta.forward && {forward: {...$meta.forward}}),
                };
            }
            if (options && options.timeout && !$applyMeta.timeout) {
                $applyMeta.timeout = hrtime();
                $applyMeta.timeout[1] += timeoutNSec;
                $applyMeta.timeout[0] += timeoutSec;
                if ($applyMeta.timeout[1] >= 1000000000) {
                    $applyMeta.timeout[0]++;
                    $applyMeta.timeout[1] -= 1000000000;
                }
            }
            if (!fn) {
                // don't try skipping socket if there is a gateway configured
                if (methodName && !this.gateway?.($applyMeta, methodName)) {
                    if (this.#config.canSkipSocket) fn = this._findMethod(methodName, methodType);
                    if (fn) unpack = true;
                }
                if (!fn) {
                    fn = this.sender(methodType, typeName);
                }
            }
            if (cache && !fnCache) {
                fnCache = this._findMethod(`${cache.port || 'cache'}`, methodType);
                // todo || bus.rpc.brokerMethod(typeName, methodType);
                if (!fnCache && !cache.optional) {
                    return Promise.reject(
                        this.#errors['remote.cacheFailed']({
                            params: {
                                typeName,
                                methodType,
                                methodName,
                            },
                        })
                    );
                }
            }
            if (fn) {
                let $metaBefore, $metaAfter;
                if (methodName) {
                    $applyMeta.opcode = this._getOpcode(methodName);
                    $applyMeta.mtid = 'request';
                    $applyMeta.method = methodName;
                    if (cache) {
                        const before =
                            cache.instead ||
                            cache.before ||
                            {
                                get: 'get',
                                fetch: 'get',
                                add: false,
                                create: false,
                                edit: 'drop',
                                update: 'drop',
                                delete: 'drop',
                                remove: 'drop',
                            }[$applyMeta.opcode];
                        $metaBefore = before && {
                            method: methodName,
                            timeout: $applyMeta.timeout,
                            auth: $applyMeta.auth,
                            cache: {
                                key: cache.key,
                                ttl: cache.ttl,
                                operation: before,
                            },
                        };
                        const after =
                            cache.after ||
                            {
                                get: 'set',
                                fetch: 'set',
                                add: 'set',
                                create: 'set',
                                edit: 'set',
                                update: 'set',
                                delete: false,
                                remove: false,
                            }[$applyMeta.opcode];
                        $metaAfter = after && {
                            method: methodName,
                            timeout: $applyMeta.timeout,
                            auth: $applyMeta.auth,
                            cache: {
                                key: cache.key,
                                ttl: cache.ttl,
                                operation: after,
                            },
                        };
                        if (!$metaBefore && !$metaAfter) {
                            return Promise.reject(
                                this.#errors['remote.cacheOperationMissing']({
                                    params: {
                                        typeName,
                                        methodType,
                                        methodName,
                                    },
                                })
                            );
                        }
                        if (typeof cache.key === 'function') {
                            const key = await cache.key(params[0]);
                            if ($metaBefore) $metaBefore.cache.key = key;
                            if ($metaAfter) $metaAfter.cache.key = key;
                        }
                    }
                }
                let applyFn;
                try {
                    const cached =
                        fnCache &&
                        $metaBefore &&
                        $metaBefore.cache.key &&
                        (await fnCache.call(this, params[0], $metaBefore));
                    if (cached && cached[0] !== null) return cached[0];
                    if (cache && cache.instead) return cached && cached[0];
                    applyFn = fn;
                    const result = await fn.apply(this, params);
                    if (
                        fnCache &&
                        $metaAfter &&
                        $metaAfter.cache.key &&
                        typeof result[0] !== 'undefined'
                    )
                        await fnCache.call(this, result[0], $metaAfter);
                    if ($meta.timer) {
                        const $resultMeta = result.length > 1 && result[result.length - 1];
                        if ($resultMeta && $resultMeta.calls) $meta.timer($resultMeta.calls);
                    }
                    if (!unpack || (options && options.returnMeta)) {
                        return result;
                    }
                    return result[0];
                } catch (error) {
                    if (fallback && fallback !== applyFn && error.type === 'bus.methodNotFound') {
                        if (fn) fn = fallback;
                        unpack = false;
                        return fn.apply(this, params);
                    }
                    return Promise.reject(this._processError(error, $applyMeta));
                }
            } else {
                return Promise.reject(
                    this.#errors['remote.bindingFailed']({
                        params: {
                            typeName,
                            methodType,
                            methodName,
                        },
                    })
                );
            }
        };

        return busMethod;
    }

    public dispatch(...params: unknown[]): boolean | Promise<unknown> {
        const $meta = (params.length > 1 && params[params.length - 1]) as IMeta;
        let mtid;
        if ($meta) {
            mtid = $meta.mtid;
            if (mtid === 'discard') return true;
            const handler =
                this.#config.canSkipSocket &&
                this._findMethod($meta.method, mtid === 'request' ? 'request' : 'publish');
            if (handler) {
                return Promise.resolve(handler(...params));
            } else {
                if (mtid === 'request') {
                    return this.#brokerRequest(...params);
                } else {
                    return this.#brokerPublish(...params);
                }
            }
        } else {
            return false;
        }
    }

    private _getPath(method: string): string {
        return method.match(/^[^[#?]*/)[0];
    }

    private _getOpcode(name: string): string {
        return this._getPath(name).split('.').pop();
    }

    private _findMethod(methodName: string, type: 'request' | 'publish'): RemoteMethod {
        methodName = this._getPath(methodName);
        const key = ['ports', methodName, type].join('.');
        let result = this.#local.get(key) || this.#local.get(methodName);
        if (!result) {
            const names = methodName.split('.');
            while (names.length) {
                result = this.#local.get(['ports', names.join('.'), type].join('.'));
                names.pop();
            }
        }
        return result && result.method;
    }

    private _processError(obj: ITypedError, $meta: IMeta): object {
        if (obj && $meta && $meta.method) {
            if (Array.isArray(obj.method)) {
                obj.method.push($meta.method);
            } else if (obj.method) {
                obj.method = [obj.method, $meta.method];
            } else {
                obj.method = $meta.method;
            }
        }
        return obj;
    }

    protected sanitize(
        params: unknown,
        {httpRequest, mtid, method, forward, language, cache}: IMeta
    ): {params: unknown; meta: object} {
        if (Array.isArray(params) && params.length) {
            const paramsArray = [...params];
            paramsArray[paramsArray.length - 1] = 'meta&';
            params = paramsArray;
        }
        return {
            params,
            meta: {mtid, method, url: httpRequest?.url, language, forward, cache},
        };
    }
}
