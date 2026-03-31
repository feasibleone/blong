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

// ---------------------------------------------------------------------------
// Factory phase guard
// ---------------------------------------------------------------------------

/**
 * Mode used when the config proxy is queried during handler factory initialisation.
 *
 * - `'throw'`   — throw immediately (default; keeps misuse from going unnoticed)
 * - `'collect'` — accumulate errors and return them from exitConfigFactoryPhase()
 *                 (useful in tests that explicitly verify the anti-pattern is caught)
 */
export type FactoryPhaseMode = 'throw' | 'collect';

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
export function enterConfigFactoryPhase(mode: FactoryPhaseMode = 'throw'): void {
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
export function exitConfigFactoryPhase(): Error[] {
    _factoryPhase.active = false;
    const errors = _factoryPhase.errors.slice();
    _factoryPhase.errors = [];
    return errors;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A flat map of dotted-path → [prev, next] pairs that represent changed keys */
export type ConfigDiff = Map<string, {prev: unknown; next: unknown}>;

/** Subscriber callback invoked after a successful reload */
export type ConfigSubscriber = (
    diff: ConfigDiff,
    next: object,
    prev: object,
) => void | Promise<void>;

export interface IConfigRuntime {
    /** Current effective config, exposed as a live proxy */
    readonly snapshot: object;
    /** Load (or reload) config from all sources; returns the updated snapshot */
    load(params?: object): Promise<object>;
    /**
     * Reload config in-place.  The backing store of the proxy is updated so all
     * existing proxy references automatically reflect the new values.
     * Returns the computed diff.
     */
    reload(): Promise<ConfigDiff>;
    /** Compute the diff between two plain config objects without modifying state */
    diff(prev: object, next: object): ConfigDiff;
    /** Register a subscriber to be called after every successful reload */
    subscribe(fn: ConfigSubscriber): () => void;
}

// ---------------------------------------------------------------------------
// createConfigProxy
// ---------------------------------------------------------------------------

/**
 * Wraps `store` in a recursive Proxy so that property lookups always read from
 * the current value of `store`.  When `store` is mutated in-place (via
 * `updateStore`), all existing proxy references automatically see the new data.
 *
 * IMPORTANT: the proxy is transparent — `typeof proxy`, `Array.isArray`, JSON
 * serialisation, and property enumeration all behave as they would on the
 * underlying plain object.  This means existing code that treats `config` as a
 * plain object continues to work without modification.
 */
export function createConfigProxy<T extends object>(
    store: T,
): {proxy: T; update: (next: T) => void} {
    // We keep a single mutable cell that holds the "current" backing object.
    // All get/set/has/ownKeys traps delegate to this cell.
    let current: T = store;

    // Cache sub-proxies so that reference equality is stable between accesses.
    const subProxies = new WeakMap<object, object>();

    function proxyFor(value: unknown): unknown {
        if (value === null || typeof value !== 'object') return value;
        if (subProxies.has(value as object)) return subProxies.get(value as object);
        // Recursively create a sub-proxy
        const {proxy: sub} = createConfigProxy(value as object);
        subProxies.set(value as object, sub);
        return sub;
    }

    const proxy = new Proxy({} as T, {
        get(_target, prop, _receiver) {
            const val = (current as Record<string | symbol, unknown>)[prop as string];
            if (val === undefined || val === null || typeof val !== 'object') {
                if (
                    _factoryPhase.active &&
                    val !== undefined &&
                    val !== null &&
                    typeof prop === 'string'
                ) {
                    const error = new Error(
                        `Config hot-reload anti-pattern: '${prop}' is a primitive read from the config ` +
                            `proxy during handler factory initialisation. The value will be captured once ` +
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
            return proxyFor(val);
        },
        set(_target, prop, value) {
            (current as Record<string | symbol, unknown>)[prop as string] = value;
            return true;
        },
        has(_target, prop) {
            return prop in (current as object);
        },
        ownKeys(_target) {
            return Reflect.ownKeys(current as object);
        },
        getOwnPropertyDescriptor(_target, prop) {
            return Object.getOwnPropertyDescriptor(current as object, prop);
        },
        getPrototypeOf(_target) {
            return Object.getPrototypeOf(current as object);
        },
        deleteProperty(_target, prop) {
            return delete (current as Record<string | symbol, unknown>)[prop as string];
        },
    });

    function update(next: T): void {
        // Replace the cell's backing data in-place; sub-proxy cache is invalidated
        // because the objects inside `current` are being replaced.
        subProxies['_clear']?.();
        current = next;
    }

    return {proxy, update};
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
// affectedNamespaces
// ---------------------------------------------------------------------------

/**
 * Given a diff and the set of known port names (e.g. `"realm.adapter.db"`),
 * return the subset of port names whose config sub-tree changed.
 *
 * A port named `"realm.adapter.db"` is considered affected if any diff key
 * starts with `"realm.adapter.db."` or equals `"realm.adapter.db"`.
 */
export function affectedNamespaces(diff: ConfigDiff, portNames: Iterable<string>): Set<string> {
    const affected = new Set<string>();
    for (const portName of portNames) {
        for (const diffKey of diff.keys()) {
            if (diffKey === portName || diffKey.startsWith(portName + '.')) {
                affected.add(portName);
                break;
            }
        }
    }
    return affected;
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

    public constructor(loadParams: object = {}) {
        this.#loadParams = loadParams;
        const {proxy, update} = createConfigProxy(this.#rawSnapshot);
        this.#proxy = proxy;
        this.#updateProxy = update;
    }

    // -----------------------------------------------------------------------
    // IConfigRuntime implementation
    // -----------------------------------------------------------------------

    public get snapshot(): object {
        return this.#proxy;
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
                    // eslint-disable-next-line no-console
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
}
