import {
    kind,
    type Adapter,
    type IAdapterFactory,
    type IApiSchema,
    type IConfigRuntime,
    type IErrorFactory,
    type ILib,
    type IMeta,
    type IModuleConfig,
    type IObjectSchema,
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
    target: {result: {error: unknown; schema: unknown}},
    apiSchema: IApiSchema | undefined,
    configRuntime: IConfigRuntime | undefined,
): (params: {
    remote: (methodName: string) => () => unknown;
    lib: ILib;
    local: object;
    literals: unknown[];
    port: Adapter;
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
        port: Adapter;
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
                get(target: ILib, functionName: string) {
                    const rec = target as unknown as Record<string, unknown>;
                    let fn: () => unknown;
                    return (
                        rec[functionName] ??
                        function (...params: unknown[]) {
                            fn ||= rec[functionName] as () => unknown;
                            if (!fn)
                                throw new Error(
                                    `Lib property '${functionName.toString()}' not found. Available properties are: ${Object.keys(
                                        rec,
                                    ).sort()}`,
                                );
                            return fn.apply(port, params as []);
                        }
                    );
                },
            }),
            handler: createHandlerProxy(local, port, remote, attachCheckpoint, lib, mergedConfig),
            errors: target.result.error,
            schema: target.result.schema,
        };
        for (let what of others) {
            switch (`${typeof what}:${kind(what)}`) {
                case 'object:lib':
                    merge(lib, what);
                    break;
                case 'function:lib':
                    what = await what(layerApi);
                    if (typeof what === 'function')
                        (lib as unknown as Record<string, unknown>)[what.name] = what;
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
                    merge(local, await apiSchema!.schema(what(layerApi), source));
                    break;
                case 'object:schema':
                    if (target.result.schema) merge(target.result.schema as object, what as object);
                    break;
                case 'function:schema': {
                    configRuntime?.enterConfig();
                    try {
                        what = await what(layerApi);
                    } finally {
                        configRuntime?.exitConfig();
                    }
                    if (typeof what === 'object' && what !== null && target.result.schema)
                        merge(target.result.schema as object, what as object);
                    break;
                }
                case 'function:handler':
                case 'function:validation':
                case 'function:model':
                case 'function:fixture':
                    configRuntime?.enterConfig();
                    try {
                        what = await what(layerApi);
                    } finally {
                        configRuntime?.exitConfig();
                    }
                    const created = await (
                        port as unknown as {createHandlers?: (opts: unknown) => Promise<unknown>}
                    )?.createHandlers?.({
                        handlers: typeof what === 'function' ? [what] : what,
                        layerApi,
                        kind: kindOfWhat,
                    });
                    if (typeof what === 'function') {
                        (local as Record<string, unknown>)[methodId(what.name)] = what;
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
    objectSchema: IObjectSchema | undefined,
    apiSchema: IApiSchema | undefined,
    port: (() => void) | undefined,
    moduleConfig: {
        pkg: IModuleConfig['pkg'];
        base: string;
        configNames?: string[];
    } & {
        [name: string]: object;
    },
    configRuntime?: IConfigRuntime,
): {result: {error: unknown; schema: unknown}; feature: unknown} {
    return new Proxy(
        {
            error: errors?.register.bind(errors),
            result: {error: errors?.get(), schema: objectSchema},
            feature() {},
        },
        {
            get(
                target: {
                    error: unknown;
                    result: {error: unknown; schema: unknown};
                    feature: unknown;
                },
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
                            type Where = {
                                methods: unknown[];
                                port?: unknown;
                                source?: string;
                                config?: unknown;
                            };
                            const resultRecord = target.result as Record<string, Where>;
                            const where: Where = (resultRecord[name] ??= {methods: [], source});
                            const targetRec = target as unknown as Record<
                                string,
                                ((fn: unknown) => void) | undefined
                            >;
                            if (targetRec[name]) merge(where, targetRec[name]!(fn));
                            else {
                                const fnArr: unknown[] = Array.isArray(fn)
                                    ? fn
                                    : fn != null
                                      ? [fn]
                                      : [];
                                const [ports, others] = fnArr.reduce(
                                    (prev: [unknown[], unknown[]], item: unknown) => {
                                        if (
                                            (port &&
                                                (item as {prototype?: unknown}).prototype instanceof
                                                    port) ||
                                            ['adapter', 'orchestrator'].includes(
                                                kind(item as unknown as Parameters<typeof kind>[0]),
                                            )
                                        )
                                            prev[0].push(item);
                                        else prev[1].push(item);
                                        return prev;
                                    },
                                    [[], []] as [unknown[], unknown[]],
                                ) as [unknown[], unknown[]];
                                ports.forEach(what => {
                                    if (
                                        what &&
                                        port &&
                                        (what as {prototype?: unknown}).prototype instanceof port
                                    ) {
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
                                            const port = new (what as unknown as IPort)({
                                                ...portApi,
                                                config: configOverride
                                                    ? merge({}, config, configOverride)
                                                    : config,
                                                configBase: moduleConfig.base,
                                            });
                                            await (
                                                port as unknown as {init: () => Promise<void>}
                                            ).init();
                                            return port;
                                        };
                                        (where.port as unknown as {config: unknown}).config =
                                            moduleConfig?.[name];
                                    } else if (
                                        what &&
                                        ['adapter', 'orchestrator'].includes(
                                            kind(what as unknown as Parameters<typeof kind>[0]),
                                        )
                                    ) {
                                        where.port = async (
                                            api: Parameters<IAdapterFactory>[0] & {id: string},
                                            configOverride: object,
                                        ) => {
                                            const {id} = api;
                                            if (!id)
                                                return (what as IAdapterFactory)(
                                                    api as Parameters<IAdapterFactory>[0],
                                                );
                                            // Assign `handlers` directly onto the api object rather
                                            // than creating a spread copy.  AdapterBase stores
                                            // `_api = api`, and Registry.ts sets
                                            // `api.attachHandlers = fn` *after* this factory
                                            // returns.  Keeping the same object reference ensures
                                            // that assignment is visible to `_api.attachHandlers`
                                            // when `start()` is called later.
                                            (api as unknown as Record<string, unknown>).handlers =
                                                what;
                                            const port = await createPort(
                                                api as unknown as Parameters<typeof createPort>[0],
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
                                        (where.port as unknown as {config: unknown}).config =
                                            moduleConfig?.[name];
                                    }
                                });
                                if (others.length)
                                    where.methods.push(
                                        createHandlerClosure(
                                            others as unknown[],
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
