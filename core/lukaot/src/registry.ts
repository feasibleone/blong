/**
 * The registry: what may be emitted, what each signal costs, and what has been observed.
 *
 * One entry per declared identifier, holding the declaration, the effective policy and the counters.
 * The policy is *read* at call time rather than copied at declaration time, which is what lets an
 * operator raise one noisy signal to `debug`, sample a hot path, or silence a method while the
 * process runs — the configuration patch and a hot reload both land in `patch()` and the next call
 * sees them (`@@D-893`).
 *
 * A policy key is either an exact identifier (`agentTicketSkipped`) or the namespace it opens
 * (`agent`), which matches every identifier that begins with it. There are no globs: a namespace is
 * the leading word of the identifier, so a quoted pattern never appears in configuration and one
 * search finds the override beside the declaration (`@@D-889`).
 */

import {LEVEL_NAMES, type ISignal, type IVocabulary, type LevelName} from './declare.ts';

/** What an operator may change about one signal, or one namespace of them. */
export interface ISignalPolicy {
    /** Whether the signal is emitted at all; an error signal is always constructed. */
    enabled?: boolean;
    /** The level a record is written at. */
    level?: LevelName;
    /** The fraction of calls that are recorded, `1` by default. */
    sample?: number;
}

/** The resolved answer for one identifier at one moment. */
export interface IResolvedPolicy {
    enabled: boolean;
    level: LevelName;
    sample: number;
}

/** What has been observed about one identifier. */
export interface ISignalCounters {
    /** Calls that reached the vocabulary, whether or not anything was written. */
    reached: number;
    /** Records handed to the writer. */
    emitted: number;
    /** Calls the sample skipped. */
    sampledOut: number;
    /** Calls a disabled policy suppressed. */
    suppressed: number;
}

/** One declared signal, with the policy and the counters that belong to it. */
export interface ISignalEntry {
    readonly signal: ISignal;
    readonly counters: ISignalCounters;
}

/** What `patch` accepts: one override per exact identifier or per namespace. */
export type PolicyPatch = Readonly<Record<string, ISignalPolicy>>;

/** The level thresholds, so a policy's level can be compared with a process's own. */
const LEVEL_ORDER = new Map<LevelName, number>(LEVEL_NAMES.map((name, index) => [name, index]));

/**
 * The declared vocabulary, indexed by identifier, with the policy each operator has set.
 *
 * A registry is built from one declaration and patched afterwards; it is not a singleton, so a test
 * gets its own and a realm's vocabulary cannot leak into another's.
 */
export class SignalRegistry {
    readonly #signal = new Map<string, ISignal>();
    readonly #policy = new Map<string, ISignalPolicy>();
    readonly #counters = new Map<string, ISignalCounters>();
    #version = 0;

    public constructor(vocabulary: IVocabulary) {
        for (const [id, signal] of Object.entries(vocabulary.signal)) {
            this.#signal.set(id, signal);
            this.#counters.set(id, {reached: 0, emitted: 0, sampledOut: 0, suppressed: 0});
        }
    }

    /** Every declared identifier, in declaration order. */
    public identifiers(): string[] {
        return [...this.#signal.keys()];
    }

    /**
     * Declare one more signal after construction.
     *
     * The compatibility logger declares a signal on the first call a package makes through it, and
     * a policy has to be able to reach that signal like any other — so it joins the same map and
     * gets the same counters. Declaring an identifier twice is a no-op, because a legacy signal is
     * keyed off its own derived name.
     */
    public declareSignal(signal: ISignal): void {
        if (this.#signal.has(signal.id)) return;
        this.#signal.set(signal.id, signal);
        this.#counters.set(signal.id, {reached: 0, emitted: 0, sampledOut: 0, suppressed: 0});
        this.#version += 1;
    }

    /** One declared signal, or `undefined` when the identifier is not declared. */
    public signal(id: string): ISignal | undefined {
        return this.#signal.get(id);
    }

    /** The counters of one identifier, or `undefined` when it is not declared. */
    public counters(id: string): ISignalCounters | undefined {
        return this.#counters.get(id);
    }

    /** A counter moved by the code that observed it. */
    public count(id: string, counter: keyof ISignalCounters): void {
        const counters = this.#counters.get(id);
        if (counters) counters[counter] += 1;
    }

    /** Bumped by every patch, so a reader that caches a resolution can tell it went stale. */
    public get version(): number {
        return this.#version;
    }

    /**
     * Merge overrides into the policy.
     *
     * Called once at assembly with the realm's `lukaot.policy` block and again whenever that block
     * reloads. A key naming an undeclared identifier is reported rather than dropped, because a
     * typo in configuration is otherwise an override that silently does nothing.
     */
    public patch(overrides: PolicyPatch): string[] {
        const unknown: string[] = [];
        for (const [key, policy] of Object.entries(overrides)) {
            if (!this.#matches(key)) {
                unknown.push(key);
                continue;
            }
            if (policy.level !== undefined && !LEVEL_ORDER.has(policy.level)) {
                throw new Error(
                    `lukaot: "${key}" sets level "${String(policy.level)}", which is not one of ` +
                        LEVEL_NAMES.join(', '),
                );
            }
            this.#policy.set(key, {...this.#policy.get(key), ...policy});
        }
        this.#version += 1;
        return unknown;
    }

    /** Whether an operator has named this identifier — the question a silent signal asks. */
    public hasPolicy(id: string): boolean {
        return this.#policy.has(id);
    }

    /**
     * The policy in force for one identifier, resolved on every read.
     *
     * The namespace answer is the base and the exact answer is laid over it, so a realm-wide level
     * and one method's sample compose instead of replacing each other.
     */
    public policy(id: string): IResolvedPolicy {
        const signal = this.#signal.get(id);
        const base: IResolvedPolicy = {
            enabled: true,
            level: signal?.level ?? 'info',
            sample: 1,
        };
        const namespace = this.#namespaceOf(id);
        const resolved = {
            ...base,
            ...(namespace === undefined ? {} : this.#policy.get(namespace)),
            ...this.#policy.get(id),
        };
        return {
            enabled: resolved.enabled !== false,
            level: resolved.level ?? base.level,
            sample: resolved.sample ?? 1,
        };
    }

    /** The namespace a policy key may name: the identifier's leading word. */
    #namespaceOf(id: string): string | undefined {
        const namespace = /^[a-z]+/.exec(id)?.[0];
        return namespace === id ? undefined : namespace;
    }

    /** Whether a policy key names something: an identifier, or the namespace of one. */
    #matches(key: string): boolean {
        return this.#signal.has(key) || [...this.#signal.keys()].some(id => id.startsWith(key));
    }
}

/** Build a registry from a declaration. */
export function createRegistry(vocabulary: IVocabulary): SignalRegistry {
    return new SignalRegistry(vocabulary);
}
