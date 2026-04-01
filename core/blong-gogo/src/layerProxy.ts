import {
    kind,
    type IAdapterFactory,
    type IApiSchema,
    type IErrorFactory,
    type IMeta,
    type IModuleConfig,
} from '@feasibleone/blong/types';
import merge from 'ut-function.merge';

import createPort from './adapter.ts';
import { enterConfigFactoryPhase, exitConfigFactoryPhase } from './ConfigRuntime.ts';
import { camelToSentence, methodId, parseAnnotatedKey } from './lib.ts';
import type { IPort } from './Port.ts';

export default function layerProxy(
    errors: IErrorFactory,
    apiSchema: IApiSchema,
    port: () => void,
    moduleConfig: {pkg: IModuleConfig['pkg']; base: string; configNames?: string[]},
): {result: unknown} {
    return new Proxy(
        {
            error: errors.register.bind(errors),
            result: {error: errors.get()},
            feature() {},
        },
        {
            get(
                target: {error: unknown; result: {error: unknown}; feature: unknown},
                name: string,
                receiver: unknown,
            ) {
                switch (name) {
                    case 'utPort':
                        return port;
                    case 'registerErrors':
                        return target.error;
                    case 'result':
                        return target.result;
                    default:
                        return (fn: unknown, namespace: string, source: string) => {
                            const where = (target.result[name] ||= {methods: [], source});
                            if (target[name]) merge(where, target[name](fn));
                            else {
                                const [ports, others] = [].concat(fn).reduce(
                                    (prev, item) => {
                                        if (
                                            item.prototype instanceof port ||
                                            ['adapter', 'orchestrator'].includes(kind(item))
                                        )
                                            prev[0].push(item);
                                        else prev[1].push(item);
                                        return prev;
                                    },
                                    [[], []],
                                );
                                ports.forEach(what => {
                                    if (what.prototype instanceof port) {
                                        where.port = async (
                                            {
                                                id,
                                                ...portApi
                                            }: Parameters<IAdapterFactory>[0] & {id: string},
                                            configOverride: object,
                                        ) => {
                                            const config = {
                                                ...moduleConfig?.[name],
                                                id,
                                                pkg: moduleConfig.pkg,
                                            };
                                            const port = new (what as IPort)({
                                                ...portApi,
                                                config: configOverride
                                                    ? merge({}, config, configOverride)
                                                    : config,
                                                configBase: moduleConfig.base,
                                            });
                                            await port.init();
                                            return port;
                                        };
                                        where.port.config = moduleConfig?.[name];
                                    } else if (['adapter', 'orchestrator'].includes(kind(what))) {
                                        where.port = async (
                                            {
                                                id,
                                                ...portApi
                                            }: Parameters<IAdapterFactory>[0] & {id: string},
                                            configOverride: object,
                                        ) => {
                                            if (!id) return what(portApi);
                                            const port = await createPort(
                                                {
                                                    ...portApi,
                                                    handlers: what,
                                                },
                                                moduleConfig.base,
                                                moduleConfig.configNames,
                                            );
                                            const config = {
                                                ...moduleConfig?.[name],
                                                id,
                                                pkg: moduleConfig.pkg,
                                            };
                                            await port.init(
                                                configOverride
                                                    ? merge({}, config, configOverride)
                                                    : config,
                                            );
                                            return port;
                                        };
                                        where.port.config = moduleConfig?.[name];
                                    }
                                });
                                if (others.length)
                                    where.methods.push(async function ({
                                        remote,
                                        lib,
                                        local,
                                        literals,
                                        port,
                                        attachCheckpoint,
                                        ...rest
                                    }: {
                                        remote: (methodName: string) => () => unknown;
                                        lib: object;
                                        local: object;
                                        literals: unknown[];
                                        port: ReturnType<IAdapterFactory>;
                                        attachCheckpoint?: (meta: IMeta) => void;
                                    }) {
                                        const mergedConfig = merge(
                                            {},
                                            moduleConfig[name],
                                            port?.config?.[namespace],
                                        ) as Record<string, unknown>;
                                        const layerApi = {
                                            ...rest,
                                            config: mergedConfig,
                                            lib: new Proxy(lib, {
                                                get(target: object, functionName: string) {
                                                    let fn: () => unknown;
                                                    return (
                                                        target[functionName] ??
                                                        function (...params: unknown[]) {
                                                            fn ||= target[functionName];
                                                            if (!fn)
                                                                throw new Error(
                                                                    `Lib property '${functionName.toString()}' not found. Available properties are: ${Object.keys(
                                                                        target,
                                                                    ).sort()}`,
                                                                );
                                                            return fn.apply(port, params);
                                                        }
                                                    );
                                                },
                                            }),
                                            handler: new Proxy(local, {
                                                get(target: unknown, handlerName: string) {
                                                    if (typeof handlerName !== 'string')
                                                        return undefined;

                                                    function rename<T>(
                                                        value: string,
                                                        fn: T,
                                                    ): T {
                                                        Object.defineProperty(fn, 'name', {
                                                            value,
                                                            configurable: true,
                                                            enumerable: false,
                                                        });
                                                        return fn;
                                                    }

                                                    function resolveHandler(
                                                        resolvedName: string,
                                                    ): (
                                                        ...params: unknown[]
                                                    ) => unknown {
                                                        let fn: () => unknown;
                                                        const sentence =
                                                            camelToSentence(
                                                                resolvedName,
                                                            );
                                                        function nameSteps(
                                                            result: unknown,
                                                        ): unknown {
                                                            if (
                                                                Array.isArray(
                                                                    result,
                                                                ) &&
                                                                !(result as {name?: string}).name
                                                            ) {
                                                                Object.defineProperty(
                                                                    result,
                                                                    'name',
                                                                    {
                                                                        value: sentence,
                                                                        configurable:
                                                                            true,
                                                                    },
                                                                );
                                                            }
                                                            return result;
                                                        }
                                                        if (
                                                            port.handles?.(resolvedName)
                                                        ) {
                                                            return rename(
                                                                resolvedName,
                                                                function (
                                                                    ...params: unknown[]
                                                                ) {
                                                                    fn ||=
                                                                        port.findHandler(
                                                                            resolvedName,
                                                                        );
                                                                    if (!fn)
                                                                        throw new Error(
                                                                            `Handler '${resolvedName}' not found`,
                                                                        );
                                                                    const $meta =
                                                                        params.length > 1
                                                                            ? (params[1] as IMeta)
                                                                            : undefined;
                                                                    if (
                                                                        $meta &&
                                                                        typeof $meta ===
                                                                            'object'
                                                                    ) {
                                                                        attachCheckpoint?.(
                                                                            $meta,
                                                                        );
                                                                    }
                                                                    return nameSteps(
                                                                        fn.apply(
                                                                            port,
                                                                            params,
                                                                        ),
                                                                    );
                                                                },
                                                            );
                                                        }
                                                        return remote(resolvedName);
                                                    }

                                                    function isSafeKey(key: string): boolean {
                                                        return key !== '__proto__' &&
                                                            key !== 'constructor' &&
                                                            key !== 'prototype';
                                                    }

                                                    function setAtPath(
                                                        obj: Record<string, unknown>,
                                                        path: string,
                                                        value: unknown,
                                                    ): void {
                                                        const parts =
                                                            path.split('.');
                                                        let current = obj;
                                                        for (
                                                            let i = 0;
                                                            i < parts.length - 1;
                                                            i++
                                                        ) {
                                                            const part = parts[i];
                                                            if (!isSafeKey(part)) return;
                                                            if (
                                                                current[part] ==
                                                                    null ||
                                                                typeof current[
                                                                    part
                                                                ] !== 'object'
                                                            ) {
                                                                current[part] = {};
                                                            }
                                                            current = current[
                                                                part
                                                            ] as Record<
                                                                string,
                                                                unknown
                                                            >;
                                                        }
                                                        const lastPart = parts[parts.length - 1];
                                                        if (isSafeKey(lastPart)) {
                                                            current[lastPart] = value;
                                                        }
                                                    }

                                                    function wrapWithMeta(
                                                        baseFn: (
                                                            ...params: unknown[]
                                                        ) => unknown,
                                                        metaOverrides: Record<
                                                            string,
                                                            unknown
                                                        >,
                                                        aliasName?: string,
                                                    ): (
                                                        ...params: unknown[]
                                                    ) => unknown {
                                                        return rename(
                                                            aliasName || baseFn.name,
                                                            function (
                                                                ...params: unknown[]
                                                            ) {
                                                                const $meta =
                                                                    params.length > 1
                                                                        ? (params[1] as IMeta)
                                                                        : undefined;
                                                                if (
                                                                    $meta &&
                                                                    typeof $meta ===
                                                                        'object'
                                                                ) {
                                                                    merge(
                                                                        $meta,
                                                                        metaOverrides,
                                                                    );
                                                                }
                                                                const result =
                                                                    baseFn(...params);
                                                                if (
                                                                    Array.isArray(result) &&
                                                                    metaOverrides.name
                                                                ) {
                                                                    Object.defineProperty(
                                                                        result,
                                                                        'name',
                                                                        {
                                                                            value: metaOverrides.name,
                                                                            configurable:
                                                                                true,
                                                                        },
                                                                    );
                                                                }
                                                                return result;
                                                            },
                                                        );
                                                    }

                                                    // Approach 2: Annotation syntax
                                                    if (
                                                        handlerName.startsWith('@')
                                                    ) {
                                                        const parsed =
                                                            parseAnnotatedKey(
                                                                handlerName,
                                                            );
                                                        const baseFn =
                                                            resolveHandler(
                                                                parsed.handlerName,
                                                            );
                                                        const metaOverrides: Record<
                                                            string,
                                                            unknown
                                                        > = {};
                                                        for (const ann of parsed.annotations) {
                                                            const hasKeyValue =
                                                                ann.params.some(p =>
                                                                    p.includes('='),
                                                                );
                                                            if (
                                                                ann.params.length > 0 &&
                                                                !hasKeyValue
                                                            ) {
                                                                // Mode A: $meta injection
                                                                metaOverrides[
                                                                    ann.name
                                                                ] =
                                                                    ann.params.join(
                                                                        ' ',
                                                                    );
                                                            } else {
                                                                // Mode B: config-object reference with deep merge
                                                                const handlerConfig =
                                                                    mergedConfig?.handler as
                                                                        | Record<
                                                                              string,
                                                                              unknown
                                                                          >
                                                                        | undefined;
                                                                const configObj =
                                                                    handlerConfig?.[
                                                                        ann.name
                                                                    ];
                                                                if (
                                                                    configObj &&
                                                                    typeof configObj ===
                                                                        'object'
                                                                ) {
                                                                    merge(
                                                                        metaOverrides,
                                                                        configObj as Record<string, unknown>,
                                                                    );
                                                                }
                                                                for (const p of ann.params) {
                                                                    const eqIdx =
                                                                        p.indexOf('=');
                                                                    if (eqIdx > 0) {
                                                                        setAtPath(
                                                                            metaOverrides,
                                                                            p.slice(
                                                                                0,
                                                                                eqIdx,
                                                                            ),
                                                                            p.slice(
                                                                                eqIdx + 1,
                                                                            ),
                                                                        );
                                                                    }
                                                                }
                                                            }
                                                        }
                                                        return wrapWithMeta(
                                                            baseFn,
                                                            metaOverrides,
                                                        );
                                                    }

                                                    // Resolve handler (local or remote)
                                                    const resolved =
                                                        resolveHandler(handlerName);

                                                    // Approach 1: Wrap with naming proxy for sub-property destructuring
                                                    return new Proxy(resolved, {
                                                        get(
                                                            proxyTarget,
                                                            prop,
                                                            receiver,
                                                        ) {
                                                            if (
                                                                typeof prop !==
                                                                    'string' ||
                                                                prop in proxyTarget
                                                            ) {
                                                                return Reflect.get(
                                                                    proxyTarget,
                                                                    prop,
                                                                    receiver,
                                                                );
                                                            }
                                                            return wrapWithMeta(
                                                                proxyTarget as (
                                                                    ...params: unknown[]
                                                                ) => unknown,
                                                                {
                                                                    name: camelToSentence(
                                                                        prop,
                                                                    ),
                                                                },
                                                                prop,
                                                            );
                                                        },
                                                        apply(
                                                            proxyTarget,
                                                            thisArg,
                                                            args,
                                                        ) {
                                                            return Reflect.apply(
                                                                proxyTarget,
                                                                thisArg,
                                                                args,
                                                            );
                                                        },
                                                    });
                                                },
                                            }),
                                            errors: target.result.error,
                                        };
                                        for (let what of others) {
                                            switch (`${typeof what}:${kind(what)}`) {
                                                case 'object:lib':
                                                    merge(lib, what);
                                                    break;
                                                case 'function:lib':
                                                    what = await what(layerApi);
                                                    if (typeof what === 'function')
                                                        lib[what.name] = what;
                                                    else merge(lib, what);
                                            }
                                        }
                                        for (let what of others) {
                                            switch (`${typeof what}:${kind(what)}`) {
                                                case 'object:handler':
                                                case 'object:validation':
                                                    merge(local, what);
                                                    break;
                                                case 'function:api':
                                                    merge(
                                                        local,
                                                        await apiSchema.schema(
                                                            what(layerApi),
                                                            source,
                                                        ),
                                                    );
                                                    break;
                                                case 'function:handler':
                                                case 'function:validation':
                                                    enterConfigFactoryPhase();
                                                    try {
                                                        what = await what(layerApi);
                                                    } finally {
                                                        exitConfigFactoryPhase();
                                                    }
                                                    if (typeof what === 'function')
                                                        local[methodId(what.name)] = what;
                                                    else {
                                                        literals.push(what);
                                                        what = methodId(what);
                                                        merge(local, what);
                                                    }
                                            }
                                        }
                                    });
                            }
                            return receiver;
                        };
                }
            },
        },
    );
}
