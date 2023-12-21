import merge from 'ut-function.merge';

import { config, kind } from '../types.js';
import createPort, { type adapter } from './adapter.js';
import { methodId } from './lib.js';
import type { Port } from './Port.js';

export default function layerProxy(errors, port, moduleConfig: {pkg: config['pkg']}) {
    return new Proxy({
        error: errors.register.bind(errors),
        result: {error: errors.get()},
        feature() {}
    }, {
        get(target, name, receiver) {
            switch (name) {
                case 'utPort': return port;
                case 'registerErrors': return target.error;
                case 'result': return target.result;
                default: return (fn: unknown, namespace, source) => {
                    const where = target.result[name] ||= {methods: [], source};
                    if (target[name]) merge(where, target[name](fn)); else {
                        const [ports, others] = [].concat(fn).reduce((prev, item) => {
                            if (item.prototype instanceof port || kind(item) === 'adapter') prev[0].push(item); else prev[1].push(item);
                            return prev;
                        }, [[], []]);
                        ports.forEach(what => {
                            if (what.prototype instanceof port) {
                                where.port = async({id, ...portApi}: Parameters<adapter>[0] & {id: string}) => {
                                    const port = new (what as Port)({ ...portApi, config: {...moduleConfig?.[name], id, pkg: moduleConfig.pkg} });
                                    await port.init();
                                    return port;
                                };
                                where.port.config = moduleConfig?.[name];
                            } else if (kind(what) === 'adapter') {
                                where.port = async({id, ...portApi}: Parameters<adapter>[0] & {id: string}) => {
                                    if (!id) return what(portApi);
                                    const port = await createPort({ ...portApi, handlers: what });
                                    await port.init({...moduleConfig?.[name], id, pkg: moduleConfig.pkg});
                                    return port;
                                };
                                where.port.config = moduleConfig?.[name];
                            }
                        });
                        others.length && where.methods.push(async function({remote, lib, local, literals, port, ...rest}) {
                            const layerApi = {
                                ...rest,
                                config: merge({}, moduleConfig[name], port?.config?.[namespace]),
                                lib: new Proxy(lib, {
                                    get(target, functionName) {
                                        let fn: () => unknown;
                                        return target[functionName] ?? function(...params: unknown[]) {
                                            fn ||= target[functionName];
                                            if (!fn) throw new Error(`Lib property '${functionName.toString()}' not found. Available properties are: ${Object.keys(target).sort()}`);
                                            return fn.apply(port, params);
                                        };
                                    }
                                }),
                                handler: new Proxy(local, {
                                    get(target, handlerName) {
                                        let fn: () => unknown;
                                        function rename(value, fn) {
                                            Object.defineProperty(fn, 'name', {value, configurable: true, enumerable: false});
                                            return fn;
                                        }
                                        return (typeof handlerName !== 'string' || port.handles?.(handlerName))
                                            ? rename(handlerName, function(...params: unknown[]) {
                                                fn ||= port.findHandler(handlerName);
                                                if (!fn) throw new Error(`Handler '${handlerName.toString()}' not found`);
                                                return fn.apply(port, params);
                                            }) : remote(handlerName);
                                    }
                                }),
                                error: target.result.error
                            };
                            for (let what of others) {
                                switch (`${typeof what}:${kind(what)}`) {
                                    case 'object:lib':
                                        merge(lib, what);
                                        break;
                                    case 'function:lib':
                                        what = await what(layerApi);
                                        if (typeof what === 'function') lib[what.name] = what;
                                        else merge(lib, what);
                                }
                            }
                            for (let what of others) {
                                switch (`${typeof what}:${kind(what)}`) {
                                    case 'object:handler':
                                    case 'object:validation':
                                        merge(local, what);
                                        break;
                                    case 'function:handler':
                                    case 'function:validation':
                                        what = await what(layerApi);
                                        if (typeof what === 'function') local[methodId(what.name)] = what;
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
        }
    });
}
