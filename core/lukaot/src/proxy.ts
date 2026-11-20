/**
 * The vocabulary proxy: the one moment the source is known is the moment it is reached.
 *
 * `signal?.agentTicketSkipped?.({ticketId})` reads a property and then calls it, and the read is
 * where a record learns *where* it was written. A `get` trap captures the first stack frame outside
 * this package — the application line that destructured or called the method — and keeps the file,
 * the line and (optionally) the whole frame list. The owner chose the file as sufficient and the
 * stack as a debugging opt-in, so `captureStack: false` is the default (`@@D-892`).
 *
 * Two properties fall out of that moment rather than needing machinery of their own:
 *
 * - **Dependencies** — the file-to-identifier edges, recorded before anything is emitted, so the
 *   question "who would emit this signal" is answerable from a run that never emitted one.
 * - **Optional chaining** — a disabled signal, one below the process's threshold, or one whose
 *   sample has run out resolves to `undefined`, so `?.(…)` skips assembling the record that would
 *   not be written (`@@D-892`). An error signal is never absent: it has to return the value the
 *   caller throws, so policy may silence its record but never its construction.
 */

import {LEVEL_NAMES, type ISignal, type LevelName} from './declare.ts';
import type {SignalRegistry} from './registry.ts';
import {captureSite, type ISite} from './site.ts';

// The capture lives in `site.ts` because a declaration records its own site too, and the two must
// report the same shape.
export {captureSite, type ISite};

/** What the proxy needs from its owner. */
export interface ISignalProxyOptions {
    /** The declaration and the policy. */
    registry: SignalRegistry;
    /** Keep the whole frame list on each site; the file and line are kept either way. */
    captureStack?: boolean;
    /** The process's level: a signal below it is absent from the proxy. */
    threshold?: LevelName;
    /**
     * What a call does once it is reached.
     *
     * The emission task supplies it; a proxy with no `emit` only counts and records where the call
     * came from, which is what makes the capture testable on its own. What it answers is what the
     * call answers — an error signal hands back the failure the caller throws.
     */
    emit?: (
        signal: ISignal,
        params: unknown,
        site: ISite | undefined,
        call?: ISignalCallOptions,
    ) => unknown;
    /** A deterministic source of randomness, so a test can pin the sampler. */
    random?: () => number;
}

/** What a caller may pass beside the values — the failure underneath, today. */
export interface ISignalCallOptions {
    /** The failure this one wraps, kept as the error's `cause`. */
    cause?: Error;
}

/** The callable a reached identifier returns. */
export type SignalCall = (params?: unknown, call?: ISignalCallOptions) => unknown;

/** The vocabulary as the proxy answers it: an identifier, or nothing when it is not wanted. */
export type VocabularyProxy = Readonly<Record<string, SignalCall | undefined>>;

/** What {@link createSignalProxy} hands back. */
export interface ISignalProxy {
    /** The object a handler destructures. */
    readonly vocabulary: VocabularyProxy;
    /** The file-to-identifier edges recorded so far. */
    dependencies(): Record<string, string[]>;
    /** The site each reached identifier was first reached from. */
    sites(): Record<string, ISite | undefined>;
    /** Whether the proxy costs anything for a given identifier as the policy stands now. */
    reachable(id: string): boolean;
}

/** The ordering a threshold compares with. */
const LEVEL_ORDER = new Map<LevelName, number>(LEVEL_NAMES.map((name, index) => [name, index]));

/**
 * Build the vocabulary a handler destructures.
 *
 * One proxy per registry, so a realm's vocabulary and its policy are the same object: the `get` trap
 * asks the registry on every read, which is what makes a reload take effect without rebuilding it.
 */
export function createSignalProxy(options: ISignalProxyOptions): ISignalProxy {
    const {
        registry,
        captureStack = false,
        threshold = 'trace',
        emit,
        random = Math.random,
    } = options;
    const edge = new Map<string, ISite | undefined>();

    /** The dependency edge is recorded once per identifier, on the first reach. */
    const siteOf = (id: string): ISite | undefined => {
        if (edge.has(id)) return edge.get(id);
        const site = captureSite(captureStack);
        edge.set(id, site);
        return site;
    };

    /** Whether the policy lets the signal be reached at all — the threshold and the switch. */
    const allowed = (id: string): boolean => {
        const signal = registry.signal(id);
        if (!signal) return false;
        const policy = registry.policy(id);
        if (!policy.enabled) return false;
        return (LEVEL_ORDER.get(policy.level) ?? 0) >= (LEVEL_ORDER.get(threshold) ?? 0);
    };

    /**
     * Whether this call is sampled in.
     *
     * An error signal always is: the caller has to throw something, so the sample decides whether
     * the record is written, never whether the value exists.
     */
    const sampled = (id: string): boolean => {
        const policy = registry.policy(id);
        return (
            registry.signal(id)?.kind === 'error' || policy.sample >= 1 || random() < policy.sample
        );
    };

    const vocabulary = new Proxy(Object.create(null) as VocabularyProxy, {
        get(_target, name) {
            if (typeof name !== 'string') return undefined;
            const signal = registry.signal(name);
            if (!signal || !allowed(name)) {
                if (signal) registry.count(name, 'suppressed');
                return undefined;
            }
            if (!sampled(name)) {
                registry.count(name, 'sampledOut');
                return undefined;
            }
            // The site is captured here, at the property read — the one moment the caller's source
            // is on the stack — and reused by every call the caller makes through it.
            const site = siteOf(name);
            return (params?: unknown, call?: ISignalCallOptions) => {
                registry.count(name, 'reached');
                return emit?.(signal, params, site, call);
            };
        },
        has(_target, name) {
            return typeof name === 'string' && registry.signal(name) !== undefined;
        },
    });

    return {
        vocabulary,
        sites() {
            return Object.fromEntries(edge);
        },
        dependencies() {
            const edges: Record<string, string[]> = {};
            for (const [id, site] of edge) {
                const file = site?.file;
                if (!file) continue;
                (edges[file] ??= []).push(id);
            }
            return edges;
        },
        reachable: allowed,
    };
}
