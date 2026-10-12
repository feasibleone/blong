import type {
    Errors,
    HRTime,
    IErrorFactory,
    IErrorMap,
    ILocal,
    ILog,
    IMeta,
    IPlatformApi,
    IRemote,
    ITypedError,
    RemoteMethod,
} from '@feasibleone/blong/types';
import {Internal} from '@feasibleone/blong/types';

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
        /**
         * Whether a call may be answered in this process instead of through the transport: `true` for
         * every method, `false` for none, or a regular-expression *source* matched against the method
         * name for the ones that belong here ({@link canAnswerLocally}).
         *
         * A configured gateway still wins, and deliberately: a method a gateway is declared for is not
         * this process's to answer, and a deployment that wants an exception says so on the other side
         * — `GatewayCodec`'s `skipGateway` keeps the method out of the gateway, and this is what the
         * fallback then resolves by. Asking the same question in two places would make the two settings
         * disagreeable; asking it here only when nothing else claims the call keeps them composable.
         */
        canSkipSocket: boolean | string;
        requireMeta: 'trace' | 'debug' | 'warn' | 'error' | 'fatal' | 'info' | true;
    } = {
        canSkipSocket: false,
        requireMeta: true,
    };

    #importCache: Record<string, unknown> = {};
    #requireMeta: ((method: string) => void) | null;
    #errors: Errors<typeof errorMap>;
    #local: ILocal;
    #platform: IPlatformApi;
    /**
     * The compiled pattern of each `canSkipSocket` source seen, `null` for one that does not compile.
     *
     * Per source rather than one slot, because a reload replaces the config and a process may see more
     * than one value in its life; the map is small enough that keeping the earlier ones costs nothing.
     */
    #skipPatterns = new Map<string, RegExp | null>();

    #brokerRequest: RemoteMethod;
    #brokerPublish: RemoteMethod;

    public constructor(
        // Declared rather than read off the caller's own interface, because a type that names only
        // `logLevel` refuses the value the loader actually passes — `canSkipSocket` among them.
        config: {logLevel?: Parameters<ILog['logger']>[0]; canSkipSocket?: boolean | string},
        {
            log,
            error,
            local,
            platform,
        }: {log: ILog; error: IErrorFactory; local: ILocal; platform: IPlatformApi},
    ) {
        super({log});
        config = this.merge(this.#config, config);
        this.#local = local;
        this.#platform = platform;
        this.#errors = error.register(errorMap);
        switch (this.#config.requireMeta) {
            case 'trace':
            case 'debug':
            case 'info':
            case 'warn': {
                this.#requireMeta = method => {
                    this.log?.[this.#config.requireMeta as 'trace' | 'debug' | 'info' | 'warn']?.(
                        this.#errors['remote.noMeta']({params: {method}}),
                    );
                };
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

    protected gateway(..._args: unknown[]): object | void {}
    protected spare(time: HRTime, latency?: number): number {
        return this.#platform.timing.spare(time, latency);
    }

    protected sender(methodType: 'request' | 'publish', typeName: 'req' | 'pub'): RemoteMethod {
        return async (...rest: unknown[]) => {
            const $meta = rest.pop() as IMeta;
            throw this.#errors['remote.bindingFailed']({
                params: {
                    methodName: $meta.method,
                    methodType,
                    typeName,
                },
            });
        };
    }

    public remote(methodName: string, options?: {method?: string; timeout?: number}): RemoteMethod {
        methodName = options?.method || methodName;
        let result; // = !options && this.#importCache[methodName];

        const startRetry = (
            fn: () => Promise<unknown>,
            {timeout, retry}: {timeout?: number; retry?: number},
        ): Promise<unknown> => {
            return new Promise((resolve, reject) => {
                const attempt = (): void => {
                    fn()
                        .then(resolve)
                        .catch((error: {params?: {method: string}}) => {
                            // todo maybe log these errors
                            if (timeout && Date.now() > timeout) {
                                if (error) error.params = {method: 'methodName'};
                                reject(this.#errors['remote.timeout'](error));
                            } else {
                                setTimeout(attempt, retry);
                            }
                        });
                };
                attempt();
            });
        };

        if (!result) {
            const method = this._getMethod(
                'req',
                'request',
                methodName,
                (options ?? {}) as {fallback?: boolean; returnMeta?: boolean; timeout?: number},
            );
            result = Object.assign(function (...params: unknown[]) {
                const $meta = params.length > 1 && (params[params.length - 1] as IMeta);
                if ($meta && $meta.timeout && $meta.retry) {
                    return startRetry(
                        () => method(...params),
                        $meta as unknown as {timeout?: number; retry?: number},
                    );
                } else {
                    return method(...params);
                }
            }, method);
            if (!options) this.#importCache[methodName!] = result;
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
        methodName: string | undefined,
        options: {
            fallback?: boolean;
            returnMeta?: boolean;
            timeout?: number;
            cache?: IMeta['cache'];
        },
    ): RemoteMethod {
        let fn: RemoteMethod | null = null;
        let unpack = true;
        const fallback = options && options.fallback;
        const timeoutSec = (options && options.timeout && Math.floor(options.timeout / 1000)) || 0;
        const timeoutNSec = (options && options.timeout && (options.timeout % 1000) * 1000000) || 0;
        let fnCache: RemoteMethod | null = null;
        const cache = options && options.cache;

        const busMethod: RemoteMethod = async (...params) => {
            const $meta = (params.length > 1 && params[params.length - 1]) as IMeta;
            let $applyMeta: IMeta;
            if (!$meta) {
                this.#requireMeta?.(methodName!);
                params.push(($applyMeta = {method: methodName}));
            } else {
                $applyMeta = params[params.length - 1] = {
                    ...$meta,
                    ...($meta.forward && {forward: {...$meta.forward}}),
                };
            }
            if (options && options.timeout && !$applyMeta.timeout) {
                $applyMeta.timeout = this.#platform.timing.now();
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
                    if (this.canAnswerLocally(methodName))
                        fn = this._findMethod(methodName, methodType);
                    if (fn) unpack = true;
                    else if (this.canAnswerLocally(methodName)) {
                        // Visibility: under canSkipSocket every call is expected
                        // to resolve locally. A missing method (e.g. a derived
                        // handler name that doesn't match a registered file —
                        // `$subject$objectModel` vs `$subject$ObjectModel`) would
                        // otherwise fail or hang silently. Name it so the typo /
                        // case / placeholder mismatch is obvious.
                        this.log?.warn?.({
                            $meta: {mtid: 'event', method: 'remote.methodNotFound'},
                            message: `remote method not found locally: '${methodName}'`,
                        });
                    }
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
                        }),
                    );
                }
            }
            if (fn) {
                let $metaBefore, $metaAfter;
                if (methodName) {
                    $applyMeta.opcode = this._getOpcode(methodName);
                    if (!['request', 'notification'].includes($applyMeta.mtid ?? ''))
                        $applyMeta.mtid = 'request';
                    $applyMeta.method = methodName!;
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
                                }),
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
                    const cached = (fnCache &&
                        $metaBefore &&
                        $metaBefore.cache.key &&
                        (await fnCache.call(this, params[0], $metaBefore))) as unknown[];
                    if (cached && cached[0] !== null) return cached[0];
                    if (cache && cache.instead) return cached && cached[0];
                    applyFn = fn;
                    const result = (await fn.apply(this, params)) as unknown[];
                    if (
                        fnCache &&
                        $metaAfter &&
                        $metaAfter.cache.key &&
                        typeof result[0] !== 'undefined'
                    )
                        await fnCache.call(this, result[0], $metaAfter);
                    if ($meta.timer) {
                        const $resultMeta = result.length > 1 && result[result.length - 1];
                        if ($resultMeta && ($resultMeta as {calls?: string}).calls)
                            $meta.timer(($resultMeta as {calls?: string}).calls);
                    }
                    if (!unpack || (options && options.returnMeta)) {
                        return result;
                    }
                    return result[0];
                } catch (error) {
                    if (
                        typeof fallback === 'function' &&
                        fallback !== applyFn &&
                        (error as {type?: string}).type === 'bus.methodNotFound'
                    ) {
                        if (fn) fn = fallback as unknown as RemoteMethod;
                        unpack = false;
                        return fn!.apply(this, params);
                    }
                    return Promise.reject(this._processError(error as ITypedError, $applyMeta));
                }
            } else {
                return Promise.reject(
                    this.#errors['remote.bindingFailed']({
                        params: {
                            typeName,
                            methodType,
                            methodName,
                        },
                    }),
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
                this.canAnswerLocally($meta.method) &&
                this._findMethod($meta.method!, mtid === 'request' ? 'request' : 'publish');
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
        return method.match(/^[^[#?]*/)?.[0] || method;
    }

    private _getOpcode(name: string): string {
        return this._getPath(name).split('.').pop()!;
    }

    /**
     * Whether a method may be answered in this process rather than through the transport.
     *
     * `true` and `false` are the two ends — a process that carries everything answers everything, one
     * that carries only its own realm answers nothing — and the string is the middle: a
     * regular-expression *source*, read against the method name, for a process that serves some of what
     * it can reach and has to send the rest out. The pattern is compiled once per value, because a
     * reload replaces the config.
     *
     * A source that does not compile is not a reason to refuse every call: it is reported once and
     * treated as nothing matching, which leaves the process dialling as it would have with `false`.
     *
     * The caller decides *when* to ask ({@link _getMethod} asks only where no gateway claims the call),
     * so nothing here knows about gateways: this is the local half of the question and the routing half
     * lives in the codec that actually routes.
     */
    protected canAnswerLocally(methodName: string | undefined): boolean {
        const {canSkipSocket} = this.#config;
        if (canSkipSocket === true) return true;
        if (typeof canSkipSocket !== 'string' || !methodName) return false;
        const cached = this.#skipPatterns.get(canSkipSocket);
        if (cached !== undefined) return cached ? cached.test(methodName) : false;
        try {
            const pattern = new RegExp(canSkipSocket);
            this.#skipPatterns.set(canSkipSocket, pattern);
            return pattern.test(methodName);
        } catch (error) {
            this.#skipPatterns.set(canSkipSocket, null);
            this.log?.warn?.({
                $meta: {mtid: 'event', method: 'remote.canSkipSocket'},
                message: `canSkipSocket is not a regular expression: ${canSkipSocket}`,
                error,
            });
            return false;
        }
    }

    private _findMethod(methodName: string, type: 'request' | 'publish'): RemoteMethod {
        methodName = this._getPath(methodName);
        const key = ['ports', methodName, type].join('.');
        let result = this.#local.get(key) || this.#local.get(methodName);
        if (!result) {
            const names = methodName.split('/')[0].split('.');
            while (!result && names.length) {
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
        {httpRequest, mtid, method, forward, language, cache}: IMeta,
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

    public async stop(): Promise<IRemote> {
        return this as unknown as IRemote;
    }
    public async start(): Promise<IRemote> {
        return this as unknown as IRemote;
    }
}
