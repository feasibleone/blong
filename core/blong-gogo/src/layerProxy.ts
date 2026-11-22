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
    moduleName: string,
    moduleConfigSlice: unknown,
    name: string,
    namespace: string,
    source: string,
    target: {result: {error: unknown; schema: unknown; vocabulary?: object[]}; error?: unknown},
    apiSchema: IApiSchema | undefined,
    configRuntime: IConfigRuntime | undefined,
    attachSignals?: () => Promise<
        | ((port: object, vocabularies: readonly object[], policy?: Record<string, object>) => void)
        | undefined
    >,
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
        // A live view, not a copy: the module slice the loader hands over is the
        // runtime's own config proxy, so re-merging it after a reload is what
        // lets a handler read a reloaded value without the layer being assembled
        // again (T-159).
        const mergedConfig = ConfigRuntime.liveLayerConfig(
            () => ConfigRuntime.mergeLayerConfig(moduleConfigSlice, port?.config?.[namespace]),
            () => configRuntime?.version ?? 0,
        );
        // The declared vocabulary, attached to the port its handlers run on (`@@T-712`). This is the
        // first place that holds both halves: the declarations the layer shipped, and the port —
        // whose bound logger is where a record is written. A port whose layer declared nothing gets
        // no `signal`, and `this.signal?.x?.()` in its code is then a no-op rather than an error; such
        // a port also never resolves the attacher, so the module behind it is not loaded at all.
        // A layer that only declares — `lukaot/` has no port and no handlers — has nowhere to attach
        // the proxy: the realm hands its array to every layer's result, and the port that answers those
        // names is an adapter or orchestrator beside it (`@@T-718`).
        if (target.result.vocabulary?.length && attachSignals && port) {
            const attach = await attachSignals();
            // The realm's own `lukaot.policy` block, read from the config this layer was handed: an
            // operator raises one identifier to `debug` or switches one off there, and nothing in the
            // layer's source changes. Read structurally so this file keeps its distance from lukaot's
            // types — it is on the browser loader's path.
            const policy = (mergedConfig as {lukaot?: {policy?: Record<string, object>}})?.lukaot
                ?.policy;
            attach?.(port, target.result.vocabulary, policy);
            // A `library()` function has no port, so the same vocabulary reaches it through the lib it
            // is handed: `lib.signal.x()` and `this.signal?.x?.()` are then one mechanism, not two.
            const vocabulary = (port as {signal?: unknown})?.signal;
            if (vocabulary) (lib as unknown as Record<string, unknown>).signal = vocabulary;
        }
        const layerApi = {
            ...rest,
            config: mergedConfig,
            lib: new Proxy(lib, {
                get(target: ILib, functionName: string) {
                    const rec = target as unknown as Record<string, unknown>;
                    let fn: () => unknown;
                    // A member the library *has* and the runtime leaves out is absent, not pending:
                    // `checkpoint` is `undefined` outside a recording mode by design, and reading it
                    // has to answer `undefined` so `lib.checkpoint?.(…)` costs the optional chain and
                    // nothing else. Only a key the library has never seen is deferred, because a later
                    // layer may merge it in (`@@T-718`).
                    if (Object.hasOwn(rec, functionName)) return rec[functionName];
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
            handler: createHandlerProxy(
                local,
                port,
                remote,
                attachCheckpoint,
                lib,
                mergedConfig,
                String(moduleName ?? '').replace(/[^A-Za-z0-9.]/g, ''),
            ),
            errors: target.result.error,
            schema: target.result.schema,
        };
        for (let what of others) {
            // process the injected library functions first @@doc:patterns/handler#injected-library-functions
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
                /**
                 * The declared vocabulary (`@@T-711` `@@T-712`).
                 *
                 * A declaration is a plain object carrying the framework's kind symbol, and it is
                 * *not* a handler, a lib or a schema — it is the list of names the layer's own code may
                 * call, so the only thing to do with it is register it: the error half with the error
                 * factory (so `errors.<name>` answers the declared message and status rather than a
                 * generated default), and the whole vocabulary on the layer's result, where the port
                 * reads it to build the `signal` proxy a handler calls.
                 */
                case 'object:vocabulary': {
                    const declaration = what as {
                        declared?: {error?: Record<string, unknown>};
                        signal?: Record<string, unknown>;
                    };
                    if (declaration.declared?.error && target.error) {
                        (target.error as (map: object) => unknown)(declaration.declared.error);
                    }
                    const vocabulary = target.result as {vocabulary?: object[]};
                    (vocabulary.vocabulary ??= []).push(declaration);
                    break;
                }
                /**
                 * The legacy `error/error.ts` map, which has no kind symbol at all.
                 *
                 * It arrives here as a bare `object:` — the shape this switch had no case for, so for
                 * as long as the folder has existed its declared messages and status codes were
                 * dropped and `errors.<name>` answered a generated default. It is registered now, by
                 * the same call the vocabulary uses, because a realm that has not moved to a
                 * declaration must keep the errors it declared (`@@T-711`).
                 */
                case 'object:':
                    if (name === 'error' && target.error) {
                        (target.error as (map: object) => unknown)(what as object);
                        break;
                    }
                    break;
                case 'function:api':
                    // Only the server platform carries an `ApiSchema`; the `api` layer is active on both,
                    // and a browser load used to reach this case with nothing to call.
                    if (apiSchema) merge(local, await apiSchema.schema(what(layerApi), source));
                    break;
                case 'object:schema':
                    if (target.result.schema)
                        lib.mergeWithSymbols(target.result.schema as object, {
                            [moduleName]: what as object,
                        });
                    break;
                case 'function:schema': {
                    configRuntime?.enterConfig();
                    try {
                        what = await what(layerApi);
                    } finally {
                        configRuntime?.exitConfig();
                    }
                    if (typeof what === 'object' && what !== null && target.result.schema)
                        lib.mergeWithSymbols(target.result.schema, {[moduleName]: what});
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
                    // Each handler is stored under TWO keys, mirroring `attachHandlers`
                    // in `adapter/schema/knex/schemaTable.ts`. The normalised one
                    // (`methodId`: dots stripped, letters lower-cased) is what
                    // `findHandler` resolves; the original-case one is what
                    // `super.<name>` looks up, and only that spelling is reachable there
                    // because JavaScript property lookup is case-sensitive. A group's
                    // `local` is an ancestor of the object literal a handler returns,
                    // which is how a handler delegates to a handler group attached
                    // *before* it — `core` is an early child for exactly this reason.
                    //
                    // Validations keep the normalised key alone: they are collected by
                    // iterating `local` (`Registry._validations`), and a second spelling
                    // of every schema would register a second name for it that
                    // `methodParts` cannot split.
                    const forSuper = kindOfWhat !== 'validation';
                    if (typeof what === 'function') {
                        (local as Record<string, unknown>)[methodId(what.name)] = what;
                        if (forSuper) (local as Record<string, unknown>)[what.name] = what;
                    } else {
                        literals.push(what);
                        if (forSuper) merge(local, what);
                        merge(local, methodId(what));
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
        name: string;
        configNames?: string[];
    } & {
        [name: string]: object;
    },
    configRuntime?: IConfigRuntime,
    /**
     * Resolve the attacher that turns a layer's declarations into the `signal` proxy.
     *
     * A *resolver*, not the function, and injected rather than imported: this module is on the browser
     * loader's path too, and `signals.ts` reaches lukaot's root — which reaches pino and
     * `node:async_hooks`. Resolving it lazily is also what keeps a process that declares nothing from
     * loading the module at all, which is every process today.
     */
    attachSignals?: () => Promise<
        | ((port: object, vocabularies: readonly object[], policy?: Record<string, object>) => void)
        | undefined
    >,
): {result: {error: unknown; schema: unknown; vocabulary?: object[]}; feature: unknown} {
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
                            // A declared vocabulary is registered *now*, not when the layer's methods
                            // are, because it needs neither the port nor the closure: it is a list of
                            // names that belongs to the layer's result and to the process-wide error
                            // factory. Deferring it was incidental, and it left a realm whose layer
                            // declares nothing but a vocabulary with no registration at all — the
                            // closure carrying it is only run while a layer's methods are registered,
                            // and `lukaot/` has no methods of its own (`@@T-717`).
                            if (kind(fn as never) === 'vocabulary') {
                                const declaration = fn as {
                                    declared?: {error?: Record<string, unknown>};
                                };
                                if (declaration.declared?.error && target.error) {
                                    (target.error as (map: object) => unknown)(
                                        declaration.declared.error,
                                    );
                                }
                                const collected = target.result as {vocabulary?: object[]};
                                (collected.vocabulary ??= []).push(fn as object);
                                return;
                            }
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
                                            moduleConfig.name,
                                            moduleConfig[name],
                                            name,
                                            namespace,
                                            source,
                                            target,
                                            apiSchema,
                                            configRuntime,
                                            attachSignals,
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
