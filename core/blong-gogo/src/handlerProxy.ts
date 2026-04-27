import type {Adapter, ILib, IMeta} from '@feasibleone/blong/types';
import merge from 'ut-function.merge';

import {camelToSentence, parseAnnotatedKey} from './lib.ts';

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
): object {
    return new Proxy(local, {
        get(target: unknown, handlerName: string) {
            if (typeof handlerName !== 'string') return undefined;

            function resolveHandler(
                resolvedName: string,
            ): (...params: unknown[]) => unknown {
                let fn: (() => unknown) | undefined;
                const sentence = camelToSentence(resolvedName);
                function nameSteps(result: unknown): unknown {
                    if (
                        Array.isArray(result) &&
                        !(result as {name?: string}).name
                    ) {
                        Object.defineProperty(result, 'name', {
                            value: sentence,
                            configurable: true,
                        });
                    }
                    return result;
                }
                if (port.handles?.(resolvedName)) {
                    return rename(
                        resolvedName,
                        function (...params: unknown[]) {
                            fn ||= port.findHandler?.(resolvedName) as (() => unknown) | undefined;
                            if (!fn)
                                throw new Error(
                                    `Handler '${resolvedName}' not found`,
                                );
                            const $meta =
                                params.length > 1
                                    ? (params[1] as IMeta)
                                    : undefined;
                            if ($meta && typeof $meta === 'object') {
                                attachCheckpoint?.($meta);
                            }
                            return nameSteps(fn.apply(port, params as []));
                        },
                    );
                }
                return remote(resolvedName);
            }

            function wrapWithMeta(
                baseFn: (...params: unknown[]) => unknown,
                metaOverrides: Record<string, unknown>,
                aliasName?: string,
            ): (...params: unknown[]) => unknown {
                return rename(
                    aliasName || baseFn.name,
                    function (...params: unknown[]) {
                        const $meta =
                            params.length > 1
                                ? (params[1] as IMeta)
                                : undefined;
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
                    },
                );
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
                            merge(
                                metaOverrides,
                                configObj as Record<string, unknown>,
                            );
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
