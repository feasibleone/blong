/**
 * The attachable vocabulary a runtime reaches for identity and capability.
 *
 * Most of semantic-log is Node-only: the ambient scope is `AsyncLocalStorage` and
 * the store and the service reach the filesystem and a socket. A runtime that
 * shares code between a server and a browser page cannot therefore import the
 * vocabulary statically — the page's bundler would follow the import into
 * `node:async_hooks` and stop there. It imports *this* module instead, which
 * imports nothing at all, and the bootstrap of whatever platform can host the
 * vocabulary attaches it once:
 *
 * ```ts
 * import {attachSemanticVocabulary} from '@feasibleone/semantic-log/attachable';
 * import * as vocabulary from '@feasibleone/semantic-log/emitter';
 * attachSemanticVocabulary(vocabulary);
 * ```
 *
 * ## Attached and unattached are the same shape
 *
 * `vocabulary` below has the same names whether or not anything was attached, and
 * an unattached one is not an error: every reader answers "no identity" and every
 * scope-binding runs the function it was handed with no scope around it. That is
 * the deliberate degradation — a dispatch path is the last place that may fail
 * because of its own telemetry — and it is also what makes the module usable from
 * a page, where there is no identity to carry and no store to write to.
 *
 * The discipline this requires of a caller is the same either way: read the
 * identity *inside* the scope, because the header a call carries is built from the
 * ambient scope, not from the arguments.
 */

/** The vocabulary as it is when attached — the emitter entry point, as a type. */
export type AttachedVocabulary = typeof import('../emitter.ts');

/** Where the vocabulary is attached, once a platform's bootstrap has loaded it. */
let attached: AttachedVocabulary | undefined;

/** Attach the vocabulary. A platform bootstrap calls this once, at startup. */
export function attachSemanticVocabulary(mod: AttachedVocabulary): void {
    attached = mod;
}

/** Detach, for a test that asserts the unattached behaviour of the facade. */
export function detachSemanticVocabulary(): void {
    attached = undefined;
}

/**
 * The emitter's vocabulary, degrading to "no identity" until it is attached.
 *
 * Every member is a pass-through: nothing is added, interpreted or defaulted
 * beyond the degradation described above, so an attached member behaves exactly as
 * the emitter entry point's own does.
 */
export const vocabulary = {
    readIdentities: (
        forward: Record<string, unknown>,
    ): ReturnType<AttachedVocabulary['readIdentities']> =>
        attached === undefined ? {} : attached.readIdentities(forward),

    isLegId: (value: string): ReturnType<AttachedVocabulary['isLegId']> =>
        attached?.isLegId(value) ?? false,

    isLegSeq: (value: string): ReturnType<AttachedVocabulary['isLegSeq']> =>
        attached?.isLegSeq(value) ?? false,

    isServiceName: (value: string): ReturnType<AttachedVocabulary['isServiceName']> =>
        attached?.isServiceName(value) ?? false,

    withFlow: <T>(identity: Parameters<AttachedVocabulary['withFlow']>[0], fn: () => T): T =>
        attached === undefined ? fn() : attached.withFlow(identity, fn),

    step: async <T>(name: string, fn: () => Promise<T> | T): Promise<T> =>
        attached === undefined ? fn() : attached.step(name, fn),

    bindTrace: <T>(trace: string, fn: () => T): T =>
        attached === undefined ? fn() : attached.bindTrace(trace, fn),

    bindInboundLeg: <T>(
        leg: Parameters<AttachedVocabulary['bindInboundLeg']>[0],
        fn: () => T,
    ): T => (attached === undefined ? fn() : attached.bindInboundLeg(leg, fn)),

    bindLeg: <T>(leg: Parameters<AttachedVocabulary['bindLeg']>[0], fn: () => T): T =>
        attached === undefined ? fn() : attached.bindLeg(leg, fn),

    identityHeaders: (): Record<string, string> =>
        attached === undefined ? {} : attached.identityHeaders(),

    enterFlow: (flow: Parameters<AttachedVocabulary['enterFlow']>[0]): void => {
        attached?.enterFlow(flow);
    },

    enterTrace: (trace: string): void => {
        attached?.enterTrace(trace);
    },

    enterInboundLeg: (leg: Parameters<AttachedVocabulary['enterInboundLeg']>[0]): void => {
        attached?.enterInboundLeg(leg);
    },

    withCapability: <T>(name: string, on: boolean, fn: () => T): T =>
        attached === undefined ? fn() : attached.withCapability(name, on, fn),

    enterCapability: (name: string, on: boolean): void => {
        attached?.enterCapability(name, on);
    },

    capabilityState: (name: string): ReturnType<AttachedVocabulary['capabilityState']> =>
        attached?.capabilityState(name),

    currentCapabilities: (): ReturnType<AttachedVocabulary['currentCapabilities']> =>
        attached?.currentCapabilities() ?? {},

    currentContext: (): ReturnType<AttachedVocabulary['currentContext']> =>
        attached?.currentContext() ?? ({} as ReturnType<AttachedVocabulary['currentContext']>),

    /**
     * Announce a milestone for the next record (PRD R26).
     *
     * Degrades to nothing, which is the whole degradation: a milestone nobody records is
     * a note that was not written, and unlike every other member here there is no
     * caller-visible result to get wrong.
     */
    point: (name: string, data?: unknown): void => {
        attached?.point(name, data);
    },

    /**
     * Take the branch whose predicate holds, recording the rationale (PRD R11/R26).
     *
     * Degrades to the **selection alone**: a branch has to be taken whether or not
     * anything is recording, so the unattached case is a plain loop rather than a no-op.
     * That is why a branch is reached through here rather than imported directly — it has
     * to work on a path that must not reach the emitter's ambient scope (F-197).
     */
    decide: <T>(
        discriminator: string,
        values: Record<string, unknown>,
        branches: ReadonlyArray<{
            name: string;
            when: (values: Record<string, unknown>) => boolean;
            run: () => T;
        }>,
    ): T | undefined => {
        if (attached !== undefined) {
            return attached.decide<T>(discriminator, values, branches);
        }
        for (const branch of branches) {
            if (branch.when(values)) {
                return branch.run();
            }
        }
        return undefined;
    },

    /** Start collecting what this scope's work announces — the receiver's first move. */
    beginProgress: (): void => {
        attached?.beginProgress();
    },

    /**
     * Take the progress announced in this scope, clearing it (PRD R26/R27).
     *
     * What the framework around a handler reads when the handler returns, so the call can
     * report what its own work was: a handler's points and branches are staged in the scope
     * it ran in, and no record is written there. `undefined` when nothing is attached, which
     * is what a browser page and an unattached process have to say.
     */
    takeProgress: (): ReturnType<AttachedVocabulary['takeProgress']> => attached?.takeProgress(),

    /** Announce progress a caller already holds, on the next record of this scope. */
    attachProgress: (progress: Parameters<AttachedVocabulary['attachProgress']>[0]): void => {
        attached?.attachProgress(progress);
    },
};
