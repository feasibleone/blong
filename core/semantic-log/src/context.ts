/**
 * Ambient context propagation (PRD R7 intent, R9 flow and step progress, R22
 * leg identity).
 *
 * `AsyncLocalStorage` is what makes intent and flow position visible on every
 * descendant record without threading a parameter through every call — the
 * spec's "propagates automatically across async boundaries" acceptance.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { Decision, FlowState, IntentState } from './record.ts';
import { assertUlid } from './ulid.ts';

/**
 * Mutable box holding the rationale that is waiting for the next record.
 *
 * A rationale cannot be a plain field on the store: every scope-creating helper
 * below (`extend`, `withFlow`, `step`) rebuilds the store with `{...context}`,
 * which copies a field's *value*. A copy held by an enclosing or sibling scope
 * would then survive the take and hand the same rationale to a second record.
 * Spreading a box copies only the *reference*, so clearing `box.decision` is
 * visible to every scope that inherited that box — which is what makes the take
 * one-shot globally rather than once per scope.
 */
export interface DecisionHolder {
    decision?: Decision;
}

/**
 * Mutable box holding the id of the most recently emitted record in this scope
 * (PRD R7).
 *
 * The same structural reason as {@link DecisionHolder} applies in the mirror
 * direction, and it is why the memory cannot be a plain field on the store:
 * `extend`, `withFlow` and `step` each rebuild the store with `{...context}`,
 * which copies a field's *value*. A value copied into a nested scope dead-ends
 * the causal chain at every scope boundary — a record emitted inside `step`
 * would be remembered only in the step's copy, so the record emitted after the
 * step would name whatever preceded the step and the step's own records would
 * be missing from the reconstructed chain. Spreading carries the *box* by
 * reference instead, so a write made in a nested scope is visible to the scope
 * that encloses it and to any nested scope entered afterwards.
 */
export interface RecordMemory {
    /** The most recently emitted record id, or absent before the first. */
    last?: string;
}

export interface AmbientContext {
    intent?: IntentState;
    flow?: FlowState;
    trace?: string;
    /**
     * The leg this scope is part of (PRD R22) — the one call it performs, or the
     * one it is answering.
     *
     * Kept beside `flow` rather than inside it because the flow object is shared
     * by reference with every nested scope, which is what makes `step`'s
     * position persist outward; replacing that object to attach a leg would
     * detach the position from the scope that encloses it. The logger merges the
     * two when it assembles a record, so on the wire and in the cache they are
     * one object.
     */
    leg?: string;
    /**
     * The receiving participant the caller declared for that leg. Set only where a
     * call is **declared** — the callee adopting an inbound leg deliberately does
     * not set it, because "who I expected to answer" is the caller's statement and
     * would read as a declaration made at the other end.
     */
    legTo?: string;
    /**
     * The leg's position in the execution: a path of counters (`1`, `1.2`), which
     * is what orders one execution's calls without any coordinator — see
     * {@link bindLeg}.
     */
    legSeq?: string;
    /**
     * Counts the legs declared in this scope, so siblings number in order.
     *
     * A box, and installed before a leg scope is entered, for the same reason the
     * record memory is: a scope-creating helper spreads the context, so a counter
     * created *inside* such a scope would be private to it, and two sibling calls
     * would both take the number 1.
     */
    legCounter?: LegCounter;
    /** Steps taken in the current flow, in order. */
    steps?: string[];
    /** Box holding the rationale waiting to be attached to a record (PRD R11). */
    pendingDecision?: DecisionHolder;
    /** Box holding the id of the most recently emitted record (PRD R7). */
    recordMemory?: RecordMemory;
}

const storage = new AsyncLocalStorage<AmbientContext>();

/** The ambient context for the current async execution. */
export function currentContext(): AmbientContext {
    return storage.getStore() ?? {};
}

function extend(patch: AmbientContext): AmbientContext {
    return {...currentContext(), ...patch};
}

/** Run `fn` with `intent` active. Nested calls override and then restore. */
export function withIntent<T>(intent: IntentState, fn: () => T): T {
    return storage.run(extend({intent}), fn);
}

/** Associate a causal trace id with the current scope (PRD R7). */
export function bindTrace<T>(trace: string, fn: () => T): T {
    return storage.run(extend({trace}), fn);
}

/** The ambient trace id, which becomes the record's `trace` reference. */
export function currentTrace(): string | undefined {
    return currentContext().trace;
}

/**
 * The shape of a leg id (PRD R22, ruled 2026-09-14).
 *
 * Letters (either case), digits, and `.`, `-` or `_` as separators. One charset
 * serves four consumers at once: the id is lawful as an HTTP header value, it is
 * greppable in source (which is what the id -> file cross-reference is built
 * from), it needs no escaping to be a mermaid label, and it cannot contain the
 * `;` that silently breaks a generated sequence diagram. Case is *not* folded,
 * because a leg is usually named after the participant that makes the call and
 * participant names are written in code (`hubA.quote.proxy` names the same
 * participant the source does). Enforced rather than recommended, because an id
 * that breaks one of those four fails somewhere other than the place that made
 * the mistake.
 */
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Whether `value` is a leg id (PRD R22).
 *
 * Exported because the two directions of propagation need the same verdict and
 * they must disagree about what to do with it: a **declared** leg is application
 * code, so a malformed one is caller misuse that fails fast (`bindLeg` throws),
 * while a leg **arriving on the wire** comes from another process, and an
 * unbalanced peer must not be able to break a request by sending a bad value. An
 * inbound value that is not a leg id is therefore read as no leg at all — the
 * same treatment the ingest gives an unusable flow kind — rather than thrown.
 */
export function isLegId(value: unknown): boolean {
    return typeof value === 'string' && NAME.test(value);
}

/**
 * Whether `value` is the name of a participant — the receiving end a caller
 * declares.
 *
 * The same charset as a leg id and deliberately a separate predicate: an id names
 * a call site, a name names a service that emits, and a reader that conflated them
 * could not say which of the two a bad value broke.
 */
export function isServiceName(value: unknown): boolean {
    return typeof value === 'string' && NAME.test(value);
}

/**
 * Whether `value` is a leg sequence: a path of counters (`1`, `1.2`, `1.2.1`).
 *
 * A **path** rather than a number, because the counter has to order one execution's
 * calls with no coordinator: the caller numbers the calls it makes from a counter
 * in its own scope, and the receiving end numbers its own calls as children of the
 * number it was given. Two services that each made a first call would both report
 * `1`, and a flat number would leave the union unable to order them — while
 * `1`, `1.1`, `1.2`, `2` is a depth-first order of the execution, which is exactly
 * what a sequence diagram is drawn from.
 *
 * Timestamps are deliberately **not** used for this: two records emitted inside one
 * millisecond cannot be ordered by a millisecond-resolution clock, and a direction
 * that rests on arrival order instead (i.e. on which service flushed its sink
 * first) is a coin flip that looks like a measurement. Measured on the fixtures, 7
 * of the 14 inter-scheme legs tied.
 */
const LEG_SEQ = /^[0-9]+(?:\.[0-9]+)*$/;

export function isLegSeq(value: unknown): boolean {
    return typeof value === 'string' && LEG_SEQ.test(value);
}

/** A box counting the legs declared in one scope. */
export interface LegCounter {
    next: number;
}

/** The leg a scope is part of (PRD R22). */
export interface LegIdentity {
    /** The call site's stable name. */
    id: string;
    /** The receiving participant, where this scope declared the call. */
    to?: string;
    /** The leg's position in the execution, where it has one. */
    seq?: string;
}

/**
 * Ensure this scope has a leg counter, and return it.
 *
 * The same reasoning as {@link ensureRecordMemory}: it has to exist **before** a
 * leg scope is entered, because entering one spreads the context — a counter
 * created inside would be private to that scope and two sibling calls would both
 * take the number 1.
 */
function ensureLegCounter(): LegCounter {
    const existing = currentContext().legCounter;
    if (existing !== undefined) {
        return existing;
    }
    const box: LegCounter = {next: 0};
    storage.enterWith({...currentContext(), legCounter: box});
    return box;
}

/** Throws unless a flow is bound, which every leg requires. */
function assertInFlow(leg: string): void {
    if (currentContext().flow === undefined) {
        throw new TypeError(
            `leg ${JSON.stringify(leg)} was bound outside a flow; run it inside withFlow`,
        );
    }
}

/**
 * Run `fn` as the **caller** of one call (PRD R22).
 *
 * A call is declared, not inferred: the id names the call site, `to` names the
 * participant the caller expects to answer, and the position is taken from a
 * counter in this scope. All three travel with the request.
 *
 * `to` is required because declaration is what makes an *attempt* observable: a
 * call whose receiver never answers — because it is missing, failing, or wired to
 * the wrong address — still appears in the observed shape, and its missing receipt
 * is then a fact about the deployment rather than an edge that cannot be drawn. It
 * is also what lets the receiver check that it is the one that was meant.
 *
 * `seq` is assigned here rather than measured: the counter lives in the enclosing
 * scope, the first call in an execution is `1`, and a call made while answering
 * `1` is `1.1`. That is a depth-first order of the execution, obtained without any
 * coordination between processes — see {@link isLegSeq} for why a clock cannot do
 * this job.
 *
 * A leg belongs to a flow's call, so binding one outside a flow has nothing to
 * attribute it to and **throws**, exactly as `step` does: this is caller misuse,
 * and inventing a flow to hold it would put a lie in the data (D3). The id and the
 * receiver are validated for the same reason — a malformed one is a local mistake
 * and would otherwise reach a header, a grep and a diagram before anyone noticed.
 *
 * Scoped, not positional: unlike `step` — which deliberately leaves the last known
 * position visible in the enclosing scope, so a stalled flow reports where it
 * stopped — a leg is visible only inside `fn`. A record emitted after the call
 * returns is not part of the call.
 */
export function bindLeg<T>(leg: {id: string; to: string}, fn: () => T): T {
    if (!isLegId(leg.id)) {
        throw new TypeError(
            `leg id must be letters, digits and '.', '-' or '_', got ${JSON.stringify(leg.id)}`,
        );
    }
    if (!isServiceName(leg.to)) {
        throw new TypeError(
            `leg ${JSON.stringify(leg.id)} must name the participant it calls, got ${JSON.stringify(leg.to)}`,
        );
    }
    const parent = currentContext().legSeq;
    const counter = ensureLegCounter();
    const seq = parent === undefined ? String(++counter.next) : `${parent}.${++counter.next}`;
    return enter({id: leg.id, to: leg.to, seq}, fn);
}

/**
 * Run `fn` as the **receiver** of a call someone else declared (PRD R22).
 *
 * The receiving end adopts the id and the position, so its records name the same
 * call as the caller's and are ordered with it; it deliberately does **not** adopt
 * `to`, which is the caller's statement about where the call was aimed. Its own
 * calls are declared with {@link bindLeg} and numbered as children of `seq`.
 *
 * The value has already been validated where it was read off the wire
 * (`flow/participant.ts`), so anything reaching here was chosen in code — and a
 * malformed id or position from *here* is caller misuse and throws.
 */
export function bindInboundLeg<T>(leg: {id: string; seq?: string}, fn: () => T): T {
    if (!isLegId(leg.id)) {
        throw new TypeError(
            `leg id must be letters, digits and '.', '-' or '_', got ${JSON.stringify(leg.id)}`,
        );
    }
    if (leg.seq !== undefined && !isLegSeq(leg.seq)) {
        throw new TypeError(
            `leg ${JSON.stringify(leg.id)} has a malformed position, got ${JSON.stringify(leg.seq)}`,
        );
    }
    return enter({id: leg.id, seq: leg.seq}, fn);
}

/** Install one leg for `fn`, from a local declaration or an adopted one. */
function enter<T>(leg: {id: string; to?: string; seq?: string}, fn: () => T): T {
    assertInFlow(leg.id);
    // The memory box has to exist *before* the leg scope is entered: `run` spreads
    // the context, so a box first installed inside the leg would never reach the
    // scope that encloses the call, and the caller's next record would lose its
    // causal parent (PRD R7).
    ensureRecordMemory();
    return storage.run(
        extend({leg: leg.id, legTo: leg.to, legSeq: leg.seq, legCounter: {next: 0}}),
        fn,
    );
}

/** The ambient leg, or `undefined` when this scope is not part of a call. */
export function currentLeg(): LegIdentity | undefined {
    const context = currentContext();
    if (context.leg === undefined) {
        return undefined;
    }
    return {id: context.leg, to: context.legTo, seq: context.legSeq};
}

/**
 * Run `fn` inside a flow identified by a caller-minted ULID and a stable kind
 * (PRD R9, amended 2026-09-13).
 *
 * The two parts answer two questions. `id` names **one execution** of the flow
 * (*which run*), so it is validated before the store is entered: an absent,
 * empty or malformed id is caller misuse and throws synchronously (D3) rather
 * than being carried into every record the scope emits as a fabricated
 * identity. `kind` names the flow **as a process** (*which recurring process*),
 * outliving any single run, and is the key the cluster service observes drift
 * under (R6c); a flow with no stable name has no drift key, so an absent or
 * empty kind is the same caller misuse and throws the same way. `id` is not the
 * trace id (a trace may span more than one flow) and neither value is minted
 * here — the library only carries what the caller supplies.
 */
export function withFlow<T>(
    flow: {id: string; kind: string; step?: string | null},
    fn: () => T,
): T {
    assertUlid(flow.id, 'flow id');
    if (typeof flow.kind !== 'string' || flow.kind.length === 0) {
        throw new TypeError(
            `flow kind must be a non-empty string, got ${JSON.stringify(flow.kind)}`,
        );
    }
    return storage.run(
        extend({
            flow: {
                id: flow.id,
                kind: flow.kind,
                step: flow.step ?? undefined,
                index: -1,
                status: 'running',
            },
            steps: [],
        }),
        fn,
    );
}

/**
 * Advance the flow to `name`, run `fn`, and record the outcome. `step` is the
 * only writer of the flow state: it mutates the per-flow object `withFlow`
 * placed in the ambient context, so the position persists in the enclosing
 * scope after the step returns — a stalled flow reports its last known step.
 *
 * The body runs under a store that carries that same flow object, so the
 * position is visible from `currentContext()` *during* the step. A step taken
 * outside any flow **throws**: it has no identity to report, and minting one —
 * the `{id: 'unnamed'}` this used to fabricate — would put a lie in the data.
 * A step belongs to a flow the caller opened; caller misuse fails fast (D3).
 *
 * The terminal status is written in a `finally` rather than through
 * `storage.enterWith`, which would apply to the step's own scope only and never
 * reach the caller.
 *
 * Steps are sequential by design. Two `step` calls running concurrently inside
 * one flow share that flow's object and its `steps` array, and each writes
 * `step`/`index`: the reported position would describe whichever advanced last,
 * and `steps` would interleave the two. Await a step before starting the next;
 * concurrent position tracking within one flow is not offered.
 */
export async function step<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
    const context = currentContext();
    const flow = context.flow;
    if (flow === undefined) {
        throw new TypeError(
            `step ${JSON.stringify(name)} was called outside a flow; run it inside withFlow`,
        );
    }
    // `withFlow` installs the step list together with the flow, and every scope-creating
    // helper below spreads the context, so the list is present wherever the flow is.
    const steps = context.steps as string[];
    flow.step = name;
    flow.index = steps.length;
    steps.push(name);
    flow.status = 'running';
    let outcome: FlowState['status'] = 'completed';
    return storage.run({...context, flow, steps}, async () => {
        try {
            return await fn();
        } catch (error) {
            outcome = 'failed';
            throw error;
            // V8 block coverage reports a phantom zero-count branch on the `finally`
            // clause below: its body is covered, but no execution can mark the clause
            // itself as taken (reproduced in plain JavaScript), so it is ignored
            // rather than left as a permanent false gap.
            /* v8 ignore next */
        } finally {
            flow.status = outcome;
        }
    });
}

/**
 * Record a branch rationale for the next emitted record (PRD R11).
 *
 * The slot lives in the ambient context rather than in the logger so that a
 * framework-free caller can state *why* it branched without holding a logger,
 * and so that the rationale travels with the async scope it was decided in.
 * `enterWith` (rather than `run`) is what lets the value outlive the call: the
 * decision is made before the record that reports it, and the caller does not
 * return from `decide` inside a callback.
 *
 * A *fresh* box is installed on every call, even when the enclosing scope
 * already carries one: a nested decision then belongs to the scope that
 * recorded it and cannot leak outward through an inherited box, and an
 * enclosing decision is not clobbered by a nested one. What must travel by
 * reference is the box itself — see `takeDecision`.
 */
export function recordDecision(decision: Decision): void {
    storage.enterWith({...currentContext(), pendingDecision: {decision}});
}

/**
 * Take the pending rationale, clearing it so it attaches to exactly one record.
 *
 * A decision describes one branch taken once, so it is consumed rather than
 * broadcast: a second call returns `undefined` and the following record does
 * not repeat it. The boxes are cleared by *mutating the box*, not by swapping
 * the store: `withFlow`, `withIntent` and `step` each rebuild the store per
 * scope by spreading, so the box is the one thing they carry by reference.
 * Swapping the store reached the current scope only — an ancestor or sibling
 * copy kept its uncleared rationale and handed it to a second record. Nothing
 * is emitted here — a decision with no record after it simply never surfaces,
 * and is dropped with the scope that held it.
 */
export function takeDecision(): Decision | undefined {
    const holder = currentContext().pendingDecision;
    if (!holder) {
        return undefined;
    }
    const {decision} = holder;
    holder.decision = undefined;
    return decision;
}

/**
 * Ensure this scope has a memory box, and return it.
 *
 * `enterWith` installs the box in the *current* async execution, so a box created
 * here is visible to the enclosing scope and to any scope entered afterwards —
 * which is why it has to exist **before** a scope-creating helper snapshots the
 * context. Creating it lazily inside such a scope would leave the scope that
 * encloses the call without a box, and the next record emitted there would lose
 * its causal parent: one chain would silently become several.
 */
function ensureRecordMemory(): RecordMemory {
    const existing = currentContext().recordMemory;
    if (existing !== undefined) {
        return existing;
    }
    const box: RecordMemory = {};
    storage.enterWith({...currentContext(), recordMemory: box});
    return box;
}

/** Remember the most recent record id, so the next record can point at it. */
export function rememberRecord(id: string): void {
    // A box already installed is mutated in place, so the update travels *back* to
    // the enclosing scope and *forward* into nested scopes by reference. A sibling
    // scope entered before this call keeps its own (empty) memory rather than
    // inheriting this record as its parent.
    ensureRecordMemory().last = id;
}

/** The most recent record id in this scope, if any (PRD R7). */
export function lastRecordId(): string | undefined {
    return currentContext().recordMemory?.last;
}
