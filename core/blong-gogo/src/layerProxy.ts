import {
    kind,
    type IAdapterFactory,
    type IErrorFactory,
    type IModuleConfig,
} from '@feasibleone/blong';
import merge from 'ut-function.merge';

import createPort from './adapter.js';
import type {IApiSchema} from './ApiSchema.js';
import {methodId} from './lib.js';
import type {IPort} from './Port.js';

export default function layerProxy(
    errors: IErrorFactory,
    apiSchema: IApiSchema,
    port: () => void,
    moduleConfig: {pkg: IModuleConfig['pkg']}
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
                receiver: unknown
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
                                    [[], []]
                                );
                                ports.forEach(what => {
                                    if (what.prototype instanceof port) {
                                        where.port = async ({
                                            id,
                                            ...portApi
                                        }: Parameters<IAdapterFactory>[0] & {id: string}) => {
                                            const port = new (what as IPort)({
                                                ...portApi,
                                                config: {
                                                    ...moduleConfig?.[name],
                                                    id,
                                                    pkg: moduleConfig.pkg,
                                                },
                                            });
                                            await port.init();
                                            return port;
                                        };
                                        where.port.config = moduleConfig?.[name];
                                    } else if (['adapter', 'orchestrator'].includes(kind(what))) {
                                        where.port = async ({
                                            id,
                                            ...portApi
                                        }: Parameters<IAdapterFactory>[0] & {id: string}) => {
                                            if (!id) return what(portApi);
                                            const port = await createPort({
                                                ...portApi,
                                                handlers: what,
                                            });
                                            await port.init({
                                                ...moduleConfig?.[name],
                                                id,
                                                pkg: moduleConfig.pkg,
                                            });
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
                                        ...rest
                                    }: {
                                        remote: (methodName: string) => () => unknown;
                                        lib: object;
                                        local: object;
                                        literals: unknown[];
                                        port: ReturnType<IAdapterFactory>;
                                    }) {
                                        const layerApi = {
                                            ...rest,
                                            config: merge(
                                                {},
                                                moduleConfig[name],
                                                port?.config?.[namespace]
                                            ),
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
                                                                        target
                                                                    ).sort()}`
                                                                );
                                                            return fn.apply(port, params);
                                                        }
                                                    );
                                                },
                                            }),
                                            handler: new Proxy(local, {
                                                get(target: unknown, handlerName: string) {
                                                    let fn: () => unknown;
                                                    function rename<T>(value: string, fn: T): T {
                                                        Object.defineProperty(fn, 'name', {
                                                            value,
                                                            configurable: true,
                                                            enumerable: false,
                                                        });
                                                        return fn;
                                                    }
                                                    return typeof handlerName !== 'string' ||
                                                        port.handles?.(handlerName)
                                                        ? rename(
                                                              handlerName,
                                                              function (...params: unknown[]) {
                                                                  fn ||=
                                                                      port.findHandler(handlerName);
                                                                  if (!fn)
                                                                      throw new Error(
                                                                          `Handler '${handlerName.toString()}' not found`
                                                                      );
                                                                  return fn.apply(port, params);
                                                              }
                                                          )
                                                        : remote(handlerName);
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
                                                            source
                                                        )
                                                    );
                                                    break;
                                                case 'function:handler':
                                                case 'function:validation':
                                                    what = await what(layerApi);
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
        }
    );
}
