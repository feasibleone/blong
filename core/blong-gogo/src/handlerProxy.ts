import type {Adapter, ILib, IMeta} from '@feasibleone/blong/types';
import merge from 'ut-function.merge';

import {camelToSentence, parseAnnotatedKey, portLogCalls} from './lib.ts';
import {declareCall} from './semanticContext.ts';

/**
 * Record the call itself, from inside the leg its caller declared.
 *
 * This is the framework's own tracing, not one of the log levels: a handler that
 * calls another method produces one start and one end record for the call, and an
 * error record if it throws. They are written *inside* the leg `declareCall`
 * bound, which is what makes them the call's evidence rather than a participant's,
 * and - because they go through the call channel - they are stored rather than
 * printed unless the process asked for them on stdout. Nothing is assembled at all
 * for a flow that opted out, which is what keeps a high-throughput flow from
 * paying for a picture of itself.
 */
function recordedCall<T>(port: unknown, leg: string, fn: () => T): T {
    const calls = portLogCalls(port);
    if (!calls?.enabled()) return fn();
    calls.start(leg);
    try {
        const result = fn();
        if (result instanceof Promise) {
            return result.then(
                value => {
                    calls.end(leg);
                    return value;
                },
                error => {
                    calls.error(leg, error);
                    throw error;
                },
            ) as T;
        }
        calls.end(leg);
        return result;
    } catch (error) {
        calls.error(leg, error);
        throw error;
    }
}

/**
 * Rename a function's `.name` property.
 */
function rename<T>(value: string, fn: T): T {
    Object.defineProperty(fn, 'name', {
        value,
        configurable: true,
        enumerable: false,
    });
    return fn;
}

/**
 * The name a leg can hold.
 *
 * A handler-group call arrives as a path (`db/accessRoleEnsure`), and its two halves are
 * exactly what a leg is made of - the callee namespace and the method - so a separator
 * becomes a dot. Lookups keep the original name: only the declaration is normalised,
 * because the registry knows the path and the leg grammar does not.
 */
function legName(name: string): string {
    return name.includes('/') ? name.replace(/\//g, '.') : name;
}

/**
 * Create the handler proxy — the IoC mechanism that resolves handler calls
 * at runtime through the registry (local or remote).
 *
 * This is the most important abstraction in the framework: handlers never
 * import each other directly; they access dependencies through this proxy.
 */
export default function createHandlerProxy(
    local: object,
    port: Adapter,
    remote: (methodName: string) => () => unknown,
    attachCheckpoint: ((meta: IMeta) => void) | undefined,
    lib: ILib,
    mergedConfig: Record<string, unknown>,
    layerName?: string,
): object {
    return new Proxy(local, {
        get(target: unknown, handlerName: string) {
            if (typeof handlerName !== 'string') return undefined;

            // The port making the call names the leg it declares: `access.db` for a handler
            // group calling through its layer's proxy, `srv.subject` for the shared subject
            // orchestrator. A layer-built proxy whose port has no id of its own falls back to
            // the layer's name, because a leg whose first segment is not a real name is
            // rejected by the grammar and that rejection is silent (F-198) - the placeholder
            // is the last resort, not the default.
            const callerId = String(
                (port as unknown as {config?: {id?: string}})?.config?.id || layerName || 'port',
            );

            function resolveHandler(resolvedName: string): (...params: unknown[]) => unknown {
                let fn: (() => unknown) | undefined;
                const sentence = camelToSentence(resolvedName);
                function nameSteps(result: unknown): unknown {
                    if (Array.isArray(result) && !(result as {name?: string}).name) {
                        Object.defineProperty(result, 'name', {
                            value: sentence,
                            configurable: true,
                        });
                    }
                    return result;
                }
                if (port?.handles?.(resolvedName)) {
                    return rename(resolvedName, function (...params: unknown[]) {
                        fn ||= port.findHandler?.(resolvedName) as (() => unknown) | undefined;
                        if (!fn) throw new Error(`Handler '${resolvedName}' not found`);
                        const $meta = params.length > 1 ? (params[1] as IMeta) : undefined;
                        if ($meta && typeof $meta === 'object') {
                            attachCheckpoint?.($meta);
                        }
                        // The caller declares the call, so the records its handler
                        // writes inside it name the same leg the callee's do. A same-port
                        // call is not a hop, so its own records are written only for a
                        // port that asks for them.
                        const record =
                            (port as unknown as {config?: {recordCalls?: boolean}})?.config
                                ?.recordCalls === true;
                        return nameSteps(
                            declareCall(
                                callerId,
                                legName(resolvedName),
                                () =>
                                    record
                                        ? recordedCall(port, resolvedName, () =>
                                              fn?.apply(port, params as []),
                                          )
                                        : fn?.apply(port, params as []),
                                $meta,
                            ),
                        );
                    });
                }
                // A remote call carries its identity in `$meta`, which travels in
                // the request body and in the outbound headers — so the declaration
                // has to be made before the transport builds the request.
                const remoteCall = remote(resolvedName) as (...params: unknown[]) => unknown;
                return rename(resolvedName, function (...params: unknown[]) {
                    const $meta = params.length > 1 ? (params[1] as IMeta) : undefined;
                    return declareCall(
                        callerId,
                        legName(resolvedName),
                        () =>
                            recordedCall(port, legName(resolvedName), () => remoteCall(...params)),
                        $meta,
                    );
                });
            }

            function wrapWithMeta(
                baseFn: (...params: unknown[]) => unknown,
                metaOverrides: Record<string, unknown>,
                aliasName?: string,
            ): (...params: unknown[]) => unknown {
                return rename(aliasName || baseFn.name, function (...params: unknown[]) {
                    const $meta = params.length > 1 ? (params[1] as IMeta) : undefined;
                    if ($meta && typeof $meta === 'object') {
                        merge($meta, metaOverrides);
                    }
                    const result = baseFn(...params);
                    if (Array.isArray(result) && metaOverrides.name) {
                        Object.defineProperty(result, 'name', {
                            value: metaOverrides.name,
                            configurable: true,
                        });
                    }
                    return result;
                });
            }

            // Approach 2: Annotation syntax
            if (handlerName.startsWith('@')) {
                const parsed = parseAnnotatedKey(handlerName);
                const baseFn = resolveHandler(parsed.handlerName);
                const metaOverrides: Record<string, unknown> = {};
                for (const ann of parsed.annotations) {
                    const hasKeyValue = ann.params.some(p => p.includes('='));
                    if (ann.params.length > 0 && !hasKeyValue) {
                        // Mode A: $meta injection
                        metaOverrides[ann.name] = ann.params.join(' ');
                    } else {
                        // Mode B: config-object reference with deep merge
                        const handlerConfig = mergedConfig?.handler as
                            | Record<string, unknown>
                            | undefined;
                        const configObj = handlerConfig?.[ann.name];
                        if (configObj && typeof configObj === 'object') {
                            merge(metaOverrides, configObj as Record<string, unknown>);
                        }
                        for (const p of ann.params) {
                            const eqIdx = p.indexOf('=');
                            if (eqIdx > 0) {
                                lib.setProperty(
                                    metaOverrides,
                                    p.slice(0, eqIdx),
                                    p.slice(eqIdx + 1),
                                );
                            }
                        }
                    }
                }
                return wrapWithMeta(baseFn, metaOverrides);
            }

            // Resolve handler (local or remote)
            const resolved = resolveHandler(handlerName);

            // Approach 1: Wrap with naming proxy for sub-property destructuring
            return new Proxy(resolved, {
                get(proxyTarget, prop, receiver) {
                    if (typeof prop !== 'string' || prop in proxyTarget) {
                        return Reflect.get(proxyTarget, prop, receiver);
                    }
                    return wrapWithMeta(
                        proxyTarget as (...params: unknown[]) => unknown,
                        {
                            name: camelToSentence(prop),
                        },
                        prop,
                    );
                },
                apply(proxyTarget, thisArg, args) {
                    return Reflect.apply(proxyTarget, thisArg, args);
                },
            });
        },
    });
}
