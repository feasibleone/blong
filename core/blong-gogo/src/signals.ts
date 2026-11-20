/**
 * The declared vocabulary a port's handlers call, as the `signal` proxy.
 *
 * A `lukaot` layer declares names; this module turns those declarations into the object a handler
 * reaches as `this.signal`. It exists here, in the framework's server runtime, because that is where
 * two things the proxy needs live: the port — which owns the log the records are written through — and
 * the loader, which is the only place that sees every declaration the layer shipped.
 *
 * ## Why the proxy is per port and not per process
 *
 * A port serves one namespace, and a namespace is one layer's handlers. A handler's vocabulary is its
 * own layer's — a realm that calls `agentTicketSkipped` has declared it in *its* `lukaot/signal.ts` —
 * so building the proxy from the layer's own declarations is what makes an undeclared call a compile
 * error at the call site instead of a runtime miss that silently records nothing.
 *
 * ## What a call does
 *
 * The record is lukaot's (`ISignalRecord`), and the writing is the port's: the record is handed to the
 * logger at the level the policy resolved to, with the identifier and the values as bindings and the
 * rendered message as the line. So a signal stays a log line where logs already go, while the identity
 * a reader greps for is the declaration's name rather than a sentence.
 *
 * An **error** signal hands back the failure the caller throws, so `throw errors.x()` and
 * `throw this.signal?.x?.()` are the same statement; the record is written by the same call
 * (`createErrorEmitter` does both), which is what makes a thrown failure observable without a second
 * line of code at the call site.
 */

import {
    compose,
    contributedVocabularies,
    createRegistry,
    signalBindings,
    signalView,
    writeThroughFace,
    type ISignalHost,
    type ISignalProxy,
    type IVocabulary,
    type PolicyPatch,
    type SignalWriter,
} from '@feasibleone/lukaot';

export {signalBindings, signalView, writeThroughFace, type ISignalHost, type SignalWriter};

/**
 * Attach the proxy for one layer's declarations to its port.
 *
 * An empty list attaches nothing: a port whose layer declared no vocabulary has no `signal`, and
 * `this.signal?.x?.()` in its code is then a no-op rather than an error — which is the same degradation
 * a realm without the layer gets, and the reason every call site is written with `?.`.
 *
 * `policy` is the realm's `lukaot.policy` config — the same names, one level up: an operator raises one
 * noisy identifier to `debug`, samples a hot path, or switches one signal off, and the code is not
 * touched. A key that matches nothing is warned about rather than ignored, because a policy written for
 * a signal that was renamed is otherwise a silent no-op the operator keeps believing in.
 */
export function attachSignals(
    port: ISignalHost,
    vocabularies: readonly IVocabulary[],
    policy?: Record<string, PolicyPatch[string]>,
): ISignalProxy | undefined {
    // The layer's declarations first, then what the *packages* in this process declared: a library has
    // no port of its own, so its names are contributed at module load and composed here, which is what
    // lets `blong-mock`'s handlers report on whichever realm attached them (`@@D-918`).
    const composed = [...contributedVocabularies(), ...vocabularies];
    if (composed.length === 0) return undefined;
    const registry = createRegistry(compose(...composed));
    if (policy && Object.keys(policy).length > 0) {
        const unknown = registry.patch(policy);
        if (unknown.length > 0) {
            const warn = port.log?.warn;
            if (typeof warn === 'function')
                warn.call(port.log, {unknown}, `lukaot: policy names no declared signal: ${unknown.join(', ')}`);
        }
    }
    const proxy = signalView(
        registry,
        port.write ?? writeThroughFace(port.log),
    );
    port.signal = proxy.vocabulary;
    return proxy;
}

