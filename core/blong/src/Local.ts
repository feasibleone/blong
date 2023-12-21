import { internal } from '../types.js';

export interface Local {
    register: (methods: object, namespace: string, reply: boolean, pkg: {version: string}) => void
    unregister: (methods: string[], namespace: string) => void
    get: (name: string) => {method: (...params: unknown[]) => Promise<unknown[]>}
}

export default class LocalImpl extends internal implements Local {
    #mapLocal = {};

    private localRegister(namespace: string, name: string, method) {
        const local = this.#mapLocal[namespace + '.' + name];
        if (local) {
            local.method = method;
        } else {
            this.#mapLocal[namespace + '.' + name] = {method};
        }
    }

    register(methods: object, namespace: string, reply: boolean, pkg: {version: string}) {
        if (methods instanceof Array) {
            methods.forEach(fn => {
                if (fn instanceof Function && fn.name) {
                    this.localRegister(namespace, fn.name, fn);
                }
            });
        } else {
            Object.keys(methods).forEach(key => {
                if (methods[key] instanceof Function) {
                    this.localRegister(namespace, key, methods[key].bind(methods));
                }
            });
        }
    }

    private localUnregister(namespace: string, name: string) {
        delete this.#mapLocal[namespace + '.' + name];
    }

    unregister(methods: string[], namespace: string) {
        methods.forEach(fn => this.localUnregister(namespace, fn));
    }

    get(name: string) {
        // if (!this.#mapLocal[name]) console.log({name, local: this.#mapLocal});
        return this.#mapLocal[name];
    }
}
