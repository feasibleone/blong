/**
 * Ambient context propagation (PRD R7 intent, R9 flow and step progress).
 *
 * `AsyncLocalStorage` is what makes intent and flow position visible on every
 * descendant record without threading a parameter through every call — the
 * spec's "propagates automatically across async boundaries" acceptance.
 */

import {AsyncLocalStorage} from 'node:async_hooks';
import type {Decision, FlowState, IntentState} from './record.ts';
import {assertUlid} from './ulid.ts';

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
        throw new TypeError(`flow kind must be a non-empty string, got ${JSON.stringify(flow.kind)}`);
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
        throw new TypeError(`step ${JSON.stringify(name)} was called outside a flow; run it inside withFlow`);
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

/** Remember the most recent record id, so the next record can point at it. */
export function rememberRecord(id: string): void {
    const memory = currentContext().recordMemory;
    if (memory) {
        // Mutated in place once a box exists, so the update travels *back* to the
        // enclosing scope and *forward* into nested scopes by reference. Only a
        // scope that has no box yet installs one, and it installs it with
        // `enterWith` so the next record emitted in the same synchronous scope —
        // and any async work started after it — sees the link. A sibling scope
        // entered before this call keeps its own (empty) memory rather than
        // inheriting this record as its parent.
        memory.last = id;
        return;
    }
    storage.enterWith({...currentContext(), recordMemory: {last: id}});
}

/** The most recent record id in this scope, if any (PRD R7). */
export function lastRecordId(): string | undefined {
    return currentContext().recordMemory?.last;
}
