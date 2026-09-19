/**
 * The framework's flow, leg and participant mapping (plan stage C).
 *
 * This is the one place where blong's dispatch vocabulary and the emitter's are
 * put together. Nothing here emits a record: it *declares* identity, and the
 * records that already exist — every `this.log?.info?.(…)` in the framework —
 * then carry a flow, a call and a position for free. That is deliberate. A
 * record per dispatch would double the volume of every process to say what the
 * calls themselves already say, and the callee emitting a receipt is worse: the
 * caller declared the call, so the caller's records are the evidence, and a
 * second end that reports the same call is a second source of truth for it.
 *
 * ## What the three identities are
 *
 * - **A flow is one outermost entry** — a gateway request, a cross-process call
 *   that arrives carrying no flow, a scheduled or event run. It is minted here,
 *   once, as a ULID; everything downstream joins it.
 * - **A participant is an RPC namespace** — `party`, `db`, `subject`. It is what
 *   a call targets, what becomes a Kubernetes service, and what the emitter
 *   derives for a record from the method name, so the two agree by construction.
 * - **A leg is one call site**, named `<caller port id>.<called method>`. The
 *   emitter's own grammar allows letters, digits and `.`, `-`, `_` only, so the
 *   plan's `a -> b` arrow is written as a dot path and anything else in a port id
 *   or method name is flattened to `-`. The id is declared by the caller, against
 *   the namespace it **aimed at** — which is the namespace the callee will derive
 *   for itself, because blong's destination rewrite (`party.subject.find` becomes
 *   `db/party.subject.find`) happens *inside* the receiving port, as a call of its
 *   own.
 *
 * ## Propagation, and where it rides
 *
 * `$meta.forward` is already the framework's carrier: it travels inside the
 * request body and is copied into outbound HTTP headers by the RPC client. The
 * emitter's one header goes in there, so a call carries its identity to another
 * process without any transport knowing about it, and `readIdentities` reads it
 * back out on arrival. `identityHeaders()` reads the *ambient* scope, so it is
 * called after the scope is entered and before the work that makes the calls.
 *
 * ## Absent, never invented
 *
 * Every helper here degrades to "no identity" rather than throwing or guessing:
 * a value that is not lawful is dropped, a scope with no flow to belong to runs
 * unlabelled, and a call whose namespace cannot be derived simply has no leg.
 * A dispatch path is the last place that may fail because of its own telemetry,
 * which is why none of this can reject and why `bindLeg` is guarded rather than
 * called optimistically — it throws on a malformed id, and it would do it
 * mid-request.
 */

import type {IMeta} from '@feasibleone/blong/types';
import {vocabulary} from '@feasibleone/semantic-log/attachable';
import type {Identities} from '@feasibleone/semantic-log/emitter';
import {monotonicFactory} from 'ulidx';

import {CALLS_CAPABILITY, callsPermitted} from './callTrace.ts';

// The emitter's vocabulary — identity, legs, capability and the ambient scope — is
// reached through `@feasibleone/semantic-log/attachable`, which imports nothing and
// degrades to "no identity" until a platform bootstrap attaches it. See that module
// for why the indirection exists: this file is reached from the *shared* realm
// machinery that the browser bootstrap loads, and the emitter's scope lives in
// `node:async_hooks`.
export {
    attachSemanticVocabulary,
    detachSemanticVocabulary,
} from '@feasibleone/semantic-log/attachable';

// The vocabulary's names, delegated, so the readers below stay short.
const {
    bindInboundLeg,
    bindLeg,
    bindTrace,
    currentContext,
    enterFlow,
    enterInboundLeg,
    enterTrace,
    identityHeaders,
    isLegId,
    isLegSeq,
    isServiceName,
    readIdentities,
    withCapability,
    withFlow,
} = vocabulary;

/**
 * Whether this flow's calls are recorded.
 *
 * Read the published decision first: a flow that entered in another process has
 * already answered this question — the answer travelled in the `cap` field of its
 * identity — and re-deciding it from the local configuration is how one flow would
 * be recorded in two halves. Only a flow nobody has decided for consults the
 * configuration.
 */
export function callsFor(meta: IMeta | undefined, entry: string): boolean {
    const decided = inboundIdentities(meta).capabilities?.[CALLS_CAPABILITY];
    return decided ?? callsPermitted(entry);
}

/**
 * Decide a capability for the rest of the current execution.
 *
 * Exported for the boundary that decides before the scope is minted — the
 * gateway's earliest hook, where a verified grant becomes the flow's capability —
 * and re-exported beside the reader so the two cannot drift.
 */
export const enterCapability = vocabulary.enterCapability;

/** The capability decided for this scope, or `undefined` when nothing decided it. */
export const capabilityOf = vocabulary.capabilityState;

/** Flow executions are ULIDs; the source is monotonic, so two in one ms stay ordered. */
const mintId = monotonicFactory();

/**
 * Crockford base32, 26 characters — the shape the emitter's `withFlow` insists
 * on. The alphabet is written as single-letter ranges (the J, K, M and N cases)
 * so the spell checker does not read it as a misspelled word; the set of accepted
 * characters is unchanged, as it is in the emitter's own matcher.
 */
const ULID = /^[0-9A-HJ-KM-NP-TV-Z]{26}$/;

/** The correlation id the framework has always minted at the gateway. */
const B3_TRACE = 'x-b3-traceid';

/** The flow kind used when an entry cannot name itself. A flow needs a non-empty kind. */
const UNLABELLED = 'unlabelled';

/** One scope's worth of validated identity. */
interface Scope {
    flow: string;
    kind: string;
    trace: string;
    leg?: string;
    seq?: string;
}

/** Is this a flow id the emitter will accept? */
export function isFlowId(value: string | undefined): value is string {
    return value !== undefined && ULID.test(value);
}

/** The identities an inbound call carries. `$meta.forward` is where they travel. */
export function inboundIdentities(meta: IMeta | undefined): Identities {
    return readIdentities((meta?.forward ?? {}) as Record<string, unknown>);
}

/** A leg id as the emitter's grammar allows it: `<caller>.<method>`, flattened. */
export function legIdFor(caller: string, method: string): string {
    const flatten = (text: string): string => text.replace(/[^A-Za-z0-9._-]/g, '-');
    return `${flatten(caller)}.${flatten(method)}`;
}

/** The participant a call targets: the first segment of its method. */
export function namespaceOf(method: string): string {
    const at = method.search(/[./]/);
    return at < 0 ? method : method.slice(0, at);
}

/** The identities an inbound `$meta` carries that can be adopted without inventing one. */
function adoptable(meta: IMeta | undefined): Identities {
    const inbound = inboundIdentities(meta);
    const usable: Identities = {};
    if (isFlowId(inbound.flow)) {
        usable.flow = inbound.flow;
    }
    if (typeof inbound.trace === 'string') {
        usable.trace = inbound.trace;
    }
    if (inbound.leg !== undefined && isLegId(inbound.leg)) {
        usable.leg = inbound.leg;
        if (inbound.seq !== undefined && isLegSeq(inbound.seq)) {
            usable.seq = inbound.seq;
        }
    }
    return usable;
}

/** The trace this entry belongs to: it was handed one, or the framework minted one. */
function traceOf(meta: IMeta, inbound: Identities): string {
    if (inbound.trace !== undefined) {
        return inbound.trace;
    }
    const forwarded = meta.forward?.[B3_TRACE];
    return typeof forwarded === 'string' && forwarded.length > 0 ? forwarded : mintId();
}

/** Enter a scope, publishing its identity so the calls made inside it carry it. */
function enter<T>(scope: Scope, meta: IMeta, fn: () => T): T {
    // Whether this flow's calls are recorded is decided here, once, and for the
    // same reason the flow itself is decided here: a decision taken per call could
    // leave one hop of a high-throughput flow recording and the rest not. A
    // boundary that decided already — the gateway, before it minted this scope —
    // wins over the configuration; otherwise the flow's own marker does, and the
    // configuration is the last resort.
    const calls = capabilityOf(CALLS_CAPABILITY) ?? callsFor(meta, scope.kind);
    const trace = (inner: () => T): T => bindTrace(scope.trace, inner);
    const leg = (inner: () => T): T =>
        scope.leg === undefined ? inner() : bindInboundLeg({id: scope.leg, seq: scope.seq}, inner);
    return withFlow({id: scope.flow, kind: scope.kind}, () =>
        trace(() =>
            leg(() =>
                withCapability(CALLS_CAPABILITY, calls, () => {
                    // Read the ambient scope now that it is complete, so the header
                    // names the leg and the decided capabilities as well as the flow.
                    // Everything the framework does from here on carries it: `Remote`
                    // clones `$meta.forward` on every hop and the RPC client copies it
                    // into the request headers.
                    meta.forward = {...meta.forward, ...identityHeaders()};
                    return fn();
                }),
            ),
        ),
    );
}

/**
 * Run an outermost entry: mint the flow, bind the trace, and publish the identity.
 *
 * Used at the boundaries where an execution begins — the gateway's routes and an
 * inbound RPC call that arrived with no flow of its own.
 */
export function runInFlow<T>(meta: IMeta, kind: string, fn: () => T): T {
    const inbound = adoptable(meta);
    return enter(
        {
            flow: inbound.flow ?? mintId(),
            kind: kind.length === 0 ? UNLABELLED : kind,
            trace: traceOf(meta, inbound),
            leg: inbound.leg,
            seq: inbound.seq,
        },
        meta,
        fn,
    );
}

/**
 * Enter the flow of an incoming HTTP request, before the framework's own hooks run.
 *
 * The enter-style sibling of {@link runInFlow}, and needed because a gateway request
 * has two phases with a framework boundary between them: the authentication and
 * metering hooks run *before* the route handler, so a call they reject never reaches
 * the code that minted a flow — the one call that failed was the one the observed
 * picture could not show. Minting it in the earliest hook gives every record of the
 * request the same execution.
 *
 * It reads headers rather than `$meta` because at that point the body is not parsed
 * yet; the identity travels in a header as well as in the body, which is what makes
 * it readable this early. The returned headers are published on the request, so the
 * route handler that follows *adopts this flow* rather than minting a second one for
 * the same request.
 */
export function enterRequestFlow(
    headers: Record<string, unknown>,
    kind: string,
): Record<string, string> {
    if (vocabulary === undefined) return {};
    const meta = {forward: {...headers}} as IMeta;
    const inbound = adoptable(meta);
    const flowKind = kind.length === 0 ? UNLABELLED : kind;
    enterFlow({id: inbound.flow ?? mintId(), kind: flowKind});
    enterTrace(traceOf(meta, inbound));
    if (inbound.leg !== undefined) enterInboundLeg({id: inbound.leg, seq: inbound.seq});
    // `enter`'s hook-form sibling, and the same decision: this is the earliest point
    // of the request, before the hooks that may reject it, so the answer is published
    // here and the route handler that follows re-enters the flow with the same one
    // (it reads the marker it was just handed). A boundary that decided before this
    // hook ran — the gateway, from a verified grant — is kept.
    enterCapability(CALLS_CAPABILITY, capabilityOf(CALLS_CAPABILITY) ?? callsFor(meta, flowKind));
    return identityHeaders();
}

/**
 * Run an inbound call in the flow it was made in, starting one if it arrived
 * without identity.
 *
 * A call from another blong process carries its flow in `$meta.forward`; a call
 * from anything else does not, and that makes this the outermost entry for it —
 * a flow of its own rather than a continuation of a flow nobody named.
 */
export function adoptInbound<T>(meta: IMeta, kind: string, fn: () => T): T {
    if (!isFlowId(inboundIdentities(meta).flow)) {
        return runInFlow(meta, kind, fn);
    }
    const inbound = adoptable(meta);
    return enter(
        {
            flow: inbound.flow as string,
            kind: kind.length === 0 ? UNLABELLED : kind,
            trace: traceOf(meta, inbound),
            leg: inbound.leg,
            seq: inbound.seq,
        },
        meta,
        fn,
    );
}

/**
 * Declare the call about to be made, so the caller's own records name it.
 *
 * Only the caller declares: the callee adopts the position from the wire and adds
 * nothing of its own. A call made outside any flow is not declared, because the
 * emitter refuses to invent an execution to hold a leg (D3) and inventing one here
 * would put a lie in the data.
 *
 * `caller` is the port making the call and `method` the wire name it is calling —
 * including any destination the caller has already applied, so the declaration
 * matches the receiver the call will actually reach.
 */
export function declareCall<T>(caller: string, method: string, fn: () => T, meta?: IMeta): T {
    if (currentContext().flow === undefined) {
        return fn();
    }
    const id = legIdFor(caller, method);
    const to = namespaceOf(method);
    if (!isLegId(id) || !isServiceName(to)) {
        // A port id or method the grammar cannot hold: the call still runs, it is
        // simply not named. Throwing here would fail a request over its telemetry.
        return fn();
    }
    return bindLeg({id, to}, () => {
        if (meta !== undefined) {
            meta.forward = {...meta.forward, ...identityHeaders()};
        }
        return fn();
    });
}

/** The flow and call the current scope belongs to, for a caller that must know. */
export function currentIdentity(): {flow?: string; leg?: string; seq?: string} {
    const context = currentContext();
    return {
        flow: context.flow?.id,
        leg: context.leg,
        seq: context.legSeq,
    };
}
