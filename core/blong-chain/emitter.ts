/**
 * A tiny typed emitter.
 *
 * `TestExecutor` only needs `on`/`once`/`off`/`emit`, and the executor must run in a browser, where
 * `node:events` is not available. Keeping the surface here also makes the event names and their
 * arguments check at the call site instead of at runtime.
 */
type Listener = (...args: never[]) => void;

export class Emitter<Events extends Record<keyof Events, Listener>> {
    private listeners = new Map<keyof Events, Set<(...args: never[]) => void>>();

    on<K extends keyof Events>(event: K, handler: Events[K]): this {
        let handlers = this.listeners.get(event);
        if (!handlers) {
            handlers = new Set();
            this.listeners.set(event, handlers);
        }
        handlers.add(handler as (...args: never[]) => void);
        return this;
    }

    once<K extends keyof Events>(event: K, handler: Events[K]): this {
        const wrapper = ((...args: never[]) => {
            this.off(event, wrapper as Events[K]);
            (handler as (...called: never[]) => void)(...args);
        }) as Events[K];
        return this.on(event, wrapper);
    }

    off<K extends keyof Events>(event: K, handler: Events[K]): this {
        this.listeners.get(event)?.delete(handler as (...args: never[]) => void);
        return this;
    }

    removeAllListeners(event?: keyof Events): this {
        if (event === undefined) this.listeners.clear();
        else this.listeners.delete(event);
        return this;
    }

    emit<K extends keyof Events>(event: K, ...args: Parameters<Events[K]>): boolean {
        const handlers = this.listeners.get(event);
        if (!handlers?.size) return false;
        for (const handler of [...handlers]) {
            (handler as (...called: Parameters<Events[K]>) => void)(...args);
        }
        return true;
    }
}
