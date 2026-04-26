import {
    kind,
    type IAdapterFactory,
    type IApiSchema,
    type IConfigRuntime,
    type IErrorFactory,
    type ILib,
    type IMeta,
    type IModuleConfig,
} from '@feasibleone/blong/types';
import merge from 'ut-function.merge';

import createPort from './AdapterBase.ts';
import ConfigRuntime from './ConfigRuntime.ts';
import createHandlerProxy from './handlerProxy.ts';
import {methodId} from './lib.ts';
import type {IPort} from './Port.ts';

/**
 * Create the handler closure that is pushed into `where.methods[]`.
 *
 * This closure is invoked later by `Registry._createHandlers()` to assemble the
 * layerApi object, load libraries, and process handler/validation/api/model items.
 */
function createHandlerClosure(
    others: any[], // eslint-disable-line @typescript-eslint/no-explicit-any
    moduleConfigSlice: unknown,
    name: string,
    namespace: string,
    source: string,
    target: {result: {error: unknown}},
    apiSchema: IApiSchema | undefined,
    configRuntime: IConfigRuntime | undefined,
): (params: {
    remote: (methodName: string) => () => unknown;
    lib: ILib;
    local: object;
    literals: unknown[];
    port: ReturnType<IAdapterFactory>;
    attachCheckpoint?: (meta: IMeta) => void;
}) => Promise<void> {
    return async function ({
        remote,
        lib,
        local,
        literals,
        port,
        attachCheckpoint,
        ...rest
    }: {
        remote: (methodName: string) => () => unknown;
        lib: ILib;
        local: object;
        literals: unknown[];
        port: ReturnType<IAdapterFactory>;
        attachCheckpoint?: (meta: IMeta) => void;
    }) {
        const mergedConfig = ConfigRuntime.mergeLayerConfig(
            moduleConfigSlice,
            port?.config?.[namespace],
        );
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
            handler: createHandlerProxy(
                local,
                port,
                remote,
                attachCheckpoint,
                lib,
                mergedConfig,
            ),
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
            const kindOfWhat = kind(what);
            switch (`${typeof what}:${kindOfWhat}`) {
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
                case 'function:model':
                    configRuntime?.enterConfig();
                    try {
                        what = await what(layerApi);
                    } finally {
                        configRuntime?.exitConfig();
                    }
                    const created = await port?.createHandlers?.({
                        handlers:
                            typeof what === 'function'
                                ? [what]
                                : what,
                        layerApi,
                        kind: kindOfWhat,
                    });
                    if (typeof what === 'function') {
                        local[methodId(what.name)] = what;
                    } else {
                        literals.push(what);
                        what = methodId(what);
                        merge(local, what);
                    }
                    Object.assign(local, methodId(created));
            }
        }
    };
}

export default function layerProxy(
    errors: IErrorFactory | undefined,
    apiSchema: IApiSchema | undefined,
    port: (() => void) | undefined,
    moduleConfig: {pkg: IModuleConfig['pkg']; base: string; configNames?: string[]},
    configRuntime?: IConfigRuntime,
): {result: unknown} {
    return new Proxy(
        {
            error: errors?.register.bind(errors),
            result: {error: errors?.get()},
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
                                            api: Parameters<IAdapterFactory>[0] & {id: string},
                                            configOverride: object,
                                        ) => {
                                            const {id} = api;
                                            if (!id) return what(api);
                                            // Assign `handlers` directly onto the api object rather
                                            // than creating a spread copy.  AdapterBase stores
                                            // `_api = api`, and Registry.ts sets
                                            // `api.attachHandlers = fn` *after* this factory
                                            // returns.  Keeping the same object reference ensures
                                            // that assignment is visible to `_api.attachHandlers`
                                            // when `start()` is called later.
                                            api.handlers = what;
                                            const port = await createPort(
                                                api,
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
                                    where.methods.push(
                                        createHandlerClosure(
                                            others,
                                            moduleConfig[name],
                                            name,
                                            namespace,
                                            source,
                                            target,
                                            apiSchema,
                                            configRuntime,
                                        ),
                                    );
                            }
                            return receiver;
                        };
                }
            },
        },
    );
}
