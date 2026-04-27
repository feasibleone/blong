/**
 * ConfigRuntime — single authoritative owner of the full config lifecycle.
 *
 * Responsibilities:
 *  1. Load & merge configuration from all sources (blong-config)
 *  2. Expose the effective config through a stable, mutable-backing Proxy
 *  3. Diff old and new snapshots to compute which port namespaces changed
 *  4. Notify subscribers (adapter ports) and emit structured log events
 *  5. Provide a reload() entry-point that replaces the writeFileSync workaround
 *
 * Leaf-access rule:
 *   Adapter and handler code MUST read config values inside the handler/exec
 *   call (e.g. `this.config.db.host`), never at startup time into a closed-over
 *   variable (e.g. `const host = config.db.host` at module top-level).
 *   The proxy guarantees that reading a path always returns the latest value,
 *   but only when accessed through the proxy reference — not through a cached
 *   primitive.
 */

import loadBlong from '@feasibleone/blong-config';
import type {
    ConfigDiff,
    ConfigSubscriber,
    FactoryPhaseMode,
    IConfigRuntime,
} from '@feasibleone/blong/types';
import merge from 'ut-function.merge';

// ---------------------------------------------------------------------------
// createConfigProxy
// ---------------------------------------------------------------------------

/**
 * Wraps `store` in a recursive Proxy so that property lookups always read from
 * the current value of `store`.  When `store` is replaced via `update()`, all
 * existing proxy references automatically see the new data because sub-proxies
 * are path-based views over the same root backing cell.
 *
 * IMPORTANT: the proxy is transparent — `typeof proxy`, `Array.isArray`, JSON
 * serialization, and property enumeration all behave as they would on the
 * underlying plain object.  This means existing code that treats `config` as a
 * plain object continues to work without modification.
 */
export function createConfigProxy<T extends object>(
    store: T,
): {
    proxy: T;
    update: (next: T) => void;
    enterConfig: (mode?: FactoryPhaseMode) => void;
    exitConfig: () => Error[];
} {
    // We keep a single mutable cell that holds the "current" backing object.
    // All proxy traps delegate through this cell so that replacing `current`
    // via update() is automatically reflected by every existing proxy reference.
    let current: T = store;

    // Cache sub-proxies by logical path so that reference equality is stable
    // between accesses, and proxies stay live across root updates because they
    // always re-traverse `current` on every property access.
    const subProxies = new Map<string, object>();

    // Unique numeric IDs for Symbol keys, so that different Symbols with the
    // same description do not collide in the path-key string.
    const symbolIds = new Map<symbol, number>();
    let symbolIdCounter = 0;

    // ---------------------------------------------------------------------------
    // Factory phase guard
    // ---------------------------------------------------------------------------

    const _factoryPhase: {active: boolean; mode: FactoryPhaseMode; errors: Error[]} = {
        active: false,
        mode: 'throw',
        errors: [],
    };

    /**
     * Mark the start of a handler factory call.  Any primitive value read from a
     * createConfigProxy proxy while the guard is active will either throw (mode =
     * 'throw', the default) or be recorded (mode = 'collect').
     *
     * Call exitConfigFactoryPhase() in a finally-block to restore safe state.
     */
    function enterConfig(mode: FactoryPhaseMode = 'throw'): void {
        _factoryPhase.active = true;
        _factoryPhase.mode = mode;
        _factoryPhase.errors = [];
    }

    /**
     * Mark the end of a handler factory call.
     *
     * Returns the list of collected errors (non-empty only when the phase was
     * entered with mode = 'collect').
     */
    function exitConfig(): Error[] {
        _factoryPhase.active = false;
        const errors = _factoryPhase.errors.slice();
        _factoryPhase.errors = [];
        return errors;
    }

    function makePathKey(path: (string | symbol)[]): string {
        // Use a separator unlikely to appear in property names.
        return path
            .map(part => {
                if (typeof part === 'string') return `s\x00${part}`;
                // Assign a stable numeric ID to each unique Symbol reference.
                let id = symbolIds.get(part);
                if (id === undefined) symbolIds.set(part, (id = symbolIdCounter++));
                return `y\x00${id}`;
            })
            .join('\x01');
    }

    function getNode(path: (string | symbol)[]): unknown {
        let node: unknown = current;
        for (const part of path) {
            if (node == null) return undefined;
            node = Reflect.get(node as object, part);
        }
        return node;
    }

    function createPathProxy(path: (string | symbol)[]): unknown {
        const key = makePathKey(path);
        if (path.length > 0) {
            const cached = subProxies.get(key);
            if (cached !== undefined) return cached;
        }

        const pathProxy = new Proxy({} as T, {
            get(_target, prop) {
                const container = getNode(path);
                const val = container == null ? undefined : Reflect.get(container as object, prop);
                if (val === undefined || val === null || typeof val !== 'object') {
                    if (
                        _factoryPhase.active &&
                        val !== undefined &&
                        val !== null &&
                        typeof prop === 'string'
                    ) {
                        const error = new Error(
                            `Config hot-reload anti-pattern: '${prop}' is a primitive read from the config ` +
                                `proxy during handler factory initialization. The value will be captured once ` +
                                `and will NOT reflect future config reloads.\n` +
                                `Fix: read the value inside the handler body instead:\n` +
                                `  ✅  handler(({config}) => ({ fn: () => config.${prop} }))\n` +
                                `  ❌  handler(({config: {${prop}}}) => ({ fn: () => ${prop} }))`,
                        );
                        if (_factoryPhase.mode === 'throw') throw error;
                        _factoryPhase.errors.push(error);
                    }
                    return val;
                }
                return createPathProxy([...path, prop]);
            },
            set(_target, prop, value) {
                const container = getNode(path);
                if (container == null) return false;
                return Reflect.set(container as object, prop, value);
            },
            has(_target, prop) {
                const container = getNode(path);
                if (container == null) return false;
                return Reflect.has(container as object, prop);
            },
            ownKeys() {
                const container = getNode(path);
                if (container == null) return [];
                return Reflect.ownKeys(container as object);
            },
            getOwnPropertyDescriptor(_target, prop) {
                const container = getNode(path);
                if (container == null) return undefined;
                return Object.getOwnPropertyDescriptor(container as object, prop);
            },
            getPrototypeOf() {
                const container = getNode(path);
                if (container == null) return Object.getPrototypeOf({});
                return Object.getPrototypeOf(container as object);
            },
            deleteProperty(_target, prop) {
                const container = getNode(path);
                if (container == null) return false;
                return Reflect.deleteProperty(container as object, prop);
            },
        });

        if (path.length > 0) {
            subProxies.set(key, pathProxy);
        }

        return pathProxy;
    }

    // Root proxy corresponds to the empty path.
    const proxy = createPathProxy([]) as T;

    function update(next: T): void {
        // Replace the cell's backing data; path-based sub-proxies automatically
        // reflect the new data because they re-traverse `current` on every access.
        current = next;
    }

    return {
        proxy,
        update,
        enterConfig,
        exitConfig,
    };
}

// ---------------------------------------------------------------------------
// deepDiff
// ---------------------------------------------------------------------------

/**
 * Compute a flat diff between two plain objects.  Returns a Map of dotted paths
 * to `{prev, next}` for every leaf that changed (added, removed, or modified).
 * Nested objects are traversed recursively; circular references are not
 * supported (configs are never circular in practice).
 */
export function deepDiff(prev: unknown, next: unknown, path = ''): ConfigDiff {
    const result: ConfigDiff = new Map();

    function isPlain(v: unknown): v is Record<string, unknown> {
        return v !== null && typeof v === 'object' && !Array.isArray(v);
    }

    function visit(p: unknown, n: unknown, prefix: string): void {
        if (isPlain(p) && isPlain(n)) {
            const keys = new Set([...Object.keys(p), ...Object.keys(n)]);
            for (const key of keys) {
                visit(p[key], n[key], prefix ? `${prefix}.${key}` : key);
            }
        } else {
            const pStr = JSON.stringify(p);
            const nStr = JSON.stringify(n);
            if (pStr !== nStr) {
                result.set(prefix, {prev: p, next: n});
            }
        }
    }

    visit(prev, next, path);
    return result;
}

// ---------------------------------------------------------------------------
// ConfigRuntime
// ---------------------------------------------------------------------------

export default class ConfigRuntime implements IConfigRuntime {
    readonly #loadParams: object;
    readonly #subscribers: Set<ConfigSubscriber> = new Set();

    #rawSnapshot: object = {};
    #proxy: object;
    #updateProxy: (next: object) => void;

    readonly enterConfig: (mode?: FactoryPhaseMode) => void;
    readonly exitConfig: () => Error[];

    public constructor(loadParams: object = {}) {
        this.#loadParams = loadParams;
        const {proxy, update, enterConfig, exitConfig} = createConfigProxy(this.#rawSnapshot);
        this.#proxy = proxy;
        this.#updateProxy = update;
        this.enterConfig = enterConfig;
        this.exitConfig = exitConfig;
    }

    // -----------------------------------------------------------------------
    // IConfigRuntime implementation
    // -----------------------------------------------------------------------

    public get snapshot(): object {
        return this.#proxy;
    }

    public get rawSnapshot(): object {
        return this.#rawSnapshot;
    }

    /**
     * Load configuration from all sources using blong-config.
     * Merges the result into the proxy backing store so existing references
     * automatically reflect the new values.
     */
    public async load(params: object = {}): Promise<object> {
        const loaded = loadBlong({...this.#loadParams, ...params});
        this.#rawSnapshot = loaded;
        this.#updateProxy(loaded);
        return this.#proxy;
    }

    /**
     * Reload config in-place:
     *  1. Load a fresh config snapshot
     *  2. Compute the diff against the previous snapshot
     *  3. Update the proxy backing store
     *  4. Notify all subscribers
     */
    public async reload(): Promise<ConfigDiff> {
        const prev = this.#rawSnapshot;
        const next = loadBlong(this.#loadParams);
        const diff = this.diff(prev, next);

        // Only do work when something actually changed
        if (diff.size > 0) {
            this.#rawSnapshot = next;
            this.#updateProxy(next);
            for (const subscriber of this.#subscribers) {
                try {
                    await subscriber(diff, next, prev);
                } catch (error) {
                    // Subscriber errors must not break the reload pipeline
                    console.error('[ConfigRuntime] subscriber error:', error);
                }
            }
        }

        return diff;
    }

    public diff(prev: object, next: object): ConfigDiff {
        return deepDiff(prev, next);
    }

    /**
     * Register a subscriber.  Returns an unsubscribe function for clean teardown.
     */
    public subscribe(fn: ConfigSubscriber): () => void {
        this.#subscribers.add(fn);
        return () => this.#subscribers.delete(fn);
    }

    // -----------------------------------------------------------------------
    // Centralized config merge methods
    //
    // These replace the scattered merge operations in loadRealm(), layerProxy,
    // and adapter.activeConfig().  Each method encapsulates a specific merge
    // scope so the merge order is documented and testable in one place.
    // -----------------------------------------------------------------------

    /**
     * Merge layer-scoped config for a handler closure.
     *
     * Previously done inline in `layerProxy.ts` / `createHandlerClosure()`:
     *   `merge({}, moduleConfig[name], port?.config?.[namespace])`
     *
     * @param moduleConfigSlice - config slice from the module (e.g. `moduleConfig[name]`)
     * @param portNamespaceConfig - namespace-specific config from the port (e.g. `port.config[namespace]`)
     */
    static mergeLayerConfig(
        moduleConfigSlice: unknown,
        portNamespaceConfig?: unknown,
    ): Record<string, unknown> {
        return merge({}, moduleConfigSlice, portNamespaceConfig) as Record<string, unknown>;
    }

    /**
     * Merge activation-scoped config for an adapter.
     *
     * Previously done inline in `AdapterBase.ts` `activeConfig()`:
     *   Walk the prototype chain collecting `activation[envName]` from each
     *   level, then merge `['default', ...activationNames]` in order.
     *
     * @param target - the adapter instance (prototype chain is walked)
     * @param activationNames - active environment names (e.g. `['dev']`)
     */
    static mergeActivationConfig(
        target: {activation?: Record<string, unknown>},
        activationNames: string[] = [],
    ): object {
        return merge([
            {},
            ...['default', ...activationNames]
                .map(name => {
                    const result = [];
                    let current = target;
                    while (current) {
                        const config = current?.['activation']?.[name];
                        if (config) result.push(config);
                        current = Object.getPrototypeOf(current);
                    }
                    return result.reverse();
                })
                .flat(),
        ]);
    }

    /**
     * Merge module configs from multiple sources in the standard order.
     *
     * Previously done in `loadRealm()`:
     *   `merge(mergedConfig, ...loadedConfigs.filter(Boolean))`
     *
     * @param base - the base config object (mutated in place)
     * @param sources - config objects to merge, in priority order
     */
    static mergeModuleConfig(base: object, ...sources: unknown[]): object {
        return merge(base, ...sources.filter(Boolean));
    }
}
