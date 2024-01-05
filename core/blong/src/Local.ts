import {Internal} from '../types.js';

export interface ILocal {
    register: (methods: object, namespace: string, reply: boolean, pkg: {version: string}) => void;
    unregister: (methods: string[], namespace: string) => void;
    get: (name: string) => {method: (...params: unknown[]) => Promise<unknown[]>};
}

export default class Local extends Internal implements ILocal {
    #mapLocal: object = {};

    private _localRegister(namespace: string, name: string, method: string): void {
        const local = this.#mapLocal[namespace + '.' + name];
        if (local) {
            local.method = method;
        } else {
            this.#mapLocal[namespace + '.' + name] = {method};
        }
    }

    public register(
        methods: object,
        namespace: string,
        reply: boolean,
        pkg: {version: string}
    ): void {
        if (methods instanceof Array) {
            methods.forEach(fn => {
                if (fn instanceof Function && fn.name) {
                    this._localRegister(namespace, fn.name, fn);
                }
            });
        } else {
            Object.keys(methods).forEach(key => {
                if (methods[key] instanceof Function) {
                    this._localRegister(namespace, key, methods[key].bind(methods));
                }
            });
        }
    }

    private _localUnregister(namespace: string, name: string): void {
        delete this.#mapLocal[namespace + '.' + name];
    }

    public unregister(methods: string[], namespace: string): void {
        methods.forEach(fn => this._localUnregister(namespace, fn));
    }

    public get(name: string): ReturnType<ILocal['get']> {
        // if (!this.#mapLocal[name]) console.log({name, local: this.#mapLocal});
        return this.#mapLocal[name];
    }
}
