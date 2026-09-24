/**
 * The record model (PRD R19/R20).
 *
 * Field names are deliberately generic: the spec forbids framework-specific
 * property names in the public contract (PRD §9).
 */

import type {LevelName} from './level.ts';

/** Reference kinds (PRD R19). The set is extensible by design. */
export type RefKind = 'record' | 'template' | 'trace' | 'payload';

/** The references a record carries, each resolvable on demand. */
export interface Refs {
    /** Record identity, minted locally at emit time. */
    record: string;
    /**
     * Template identity, derived locally from the fingerprint by `withIdentity`
     * so it stays stable across deploys without a round trip (PRD R19/R12). The
     * cluster service keys its registry on this same value.
     */
    template?: string;
    /** Causal trace identity, propagated from the ambient context. */
    trace?: string;
    /**
     * The record that caused this one, within the same async scope (PRD R7).
     *
     * Causal, and orthogonal to both the trace and the flow: a trace groups
     * records that belong to one request, and a flow names one called process,
     * but neither says *which record caused which*. This is the link that lets
     * the lineage index (`service/lineage.ts`) walk a chain root-first. It is
     * **optional on the wire** so a service that has not been updated still
     * ingests a record that omits it (as `flow`, `operation` and `trace`
     * were added) — an absent parent link degrades lineage to trace ordering,
     * it does not reject the record.
     */
    parent?: string;
    /**
     * Payload references, keyed by the field whose value they stand for (PRD
     * R19/R20: "an inline payload reference (for large embedded values that
     * would otherwise bloat the line)").
     *
     * The value itself stays in `fields`: the record remains complete, JSON mode
     * carries it verbatim, and the *rendered line* is the only surface the
     * reference shortens. This is what makes the kind an **inline** payload
     * reference rather than a claim check — nothing is removed from the record to
     * be fetched back before it can be understood.
     *
     * Absent when the record carries no large value, and absent when no store is
     * configured: a reference nothing retains is a dead link, so the logger mints
     * one exactly when it has retained the payload (see `logger.ts`).
     */
    payloads?: Record<string, string>;
}

/** A branch/decision rationale (PRD R11). */
export interface Decision {
    /** What the branch was about, stable across runs. */
    discriminator: string;
    /** Every candidate branch considered, in evaluation order. */
    candidates: string[];
    /** The branch actually taken. */
    chosen: string;
    /** The values the decision was made from. */
    values: Record<string, unknown>;
}

/**
 * A milestone a handler reported (PRD R26) — the reporting half of a progress
 * point.
 *
 * A checkpoint and a decision are one concept in two shapes: a point says *what
 * happened here*, a {@link RegionMark} says *which branch this was inside*. Both
 * ride the same slot, so nothing downstream learns two mechanisms.
 */
export interface Point {
    /** Stable name of the moment, e.g. `total-calculated` (PRD R12: structure, not prose). */
    name: string;
    /**
     * What was true there. Retained locally and never transmitted: the name is
     * structural and identifies the code path, the data is payload — the rule
     * `Decision.values` follows, for the reason R1 and R10 give.
     */
    data?: unknown;
}

/**
 * The branch a record was emitted inside (PRD R26).
 *
 * Stamped on **every** record the chosen branch produced, which is what lets a
 * sequence diagram draw an `alt`/`else`/`end` block around exactly the calls the
 * branch made. A record that merely *reports* a rationale (the one-shot
 * `decision`) carries no region: reporting a branch is not being inside it.
 *
 * Every field here is a name, so the whole mark may be transmitted — unlike
 * {@link Point} and `Decision.values`, whose payload stays in the local record.
 */
export interface RegionMark {
    /**
     * The path of counters identifying the branch, `1` or `3.1`.
     *
     * It is a *position*, not structure, so it shapes nothing downstream: it
     * groups the records one branch emitted, and it is deliberately absent from
     * the record's identity (PRD R12).
     */
    id: string;
    discriminator: string;
    /** Every candidate considered, in evaluation order. */
    candidates: string[];
    chosen: string;
    /**
     * How many of the record's points were announced before this branch was taken
     * (PRD R27).
     *
     * A point announced before a decision is not the decision's work, and a reader
     * must not read the block as having caused it: the record says how many came
     * first, so the ones before it are drawn outside the block and the ones after it
     * inside. A count rather than a flag because the mark is one per branch: with
     * `n` points already announced, everything up to `n` happened before it.
     */
    pointsBefore?: number;
}

/** The progress points recorded on one record (PRD R26). */
export interface Progress {
    /**
     * The branches this record was emitted inside, **outermost first** — one entry
     * for a branch taken at the top level, more when a branch was taken within
     * another.
     *
     * A chain rather than a single mark because a record can only report the
     * region it is *in*: without the enclosing entry, the outer branch's
     * alternatives would be unknown to a reader of the inner record and the
     * enclosing `alt` block could not be drawn at all.
     */
    regions?: RegionMark[];
    /** Milestones announced at this point, in the order they were announced. */
    points?: Point[];
}

/** Flow position and the call it is part of (PRD R9, R22). */
export interface FlowState {
    /**
     * The flow identity: a ULID the **caller** minted for one execution of the
     * flow — a correlation id, not the flow's name and not the trace id (PRD
     * R9, ruled 2026-09-13). Two steps carrying the same value are the same
     * run; a new run mints a new ULID. The library carries this value and never
     * mints it, and `withFlow` rejects an absent or malformed one.
     *
     * So `id` answers *which run*. It is **not** the drift key: the ingest tells
     * one execution from the next by this value, and drift — which compares runs
     * of the same recurring process — keys on `kind` instead, because a value
     * naming one execution gives every drift key exactly one observation.
     */
    id: string;
    /**
     * The stable name of the flow **as a process** (e.g. `transfer.single`),
     * supplied by the caller and propagated with the rest of the flow identity
     * (PRD R9/R6c, ruled 2026-09-13). So `kind` answers *which recurring
     * process*, outliving any single run — which is why it, and not `id`, is the
     * key drift is observed under (R6c). Required, because a flow with no stable
     * name has no drift key; `withFlow` rejects an absent or empty one.
     */
    kind: string;
    /**
     * The **leg** this record belongs to: a caller-declared, stable identifier
     * for one traversal of one edge of the flow (PRD R22, ruled 2026-09-14).
     *
     * `step` says *where in the flow* a record was emitted; `leg` says *which
     * call* it belongs to — and unlike a step name, which every participant
     * repeats, a leg id is shared with the other end of that call. It names a
     * **call site**, not a position: the caller declares it with `bindLeg`, the
     * callee adopts the same value from the propagated identity, and the two
     * records the service receives therefore name one leg.
     *
     * The value's shape is validated where it is bound (letters, digits and
     * `.`/`-`/`_` separators) because one charset has to survive four consumers:
     * an HTTP header value, a source-code grep for the id -> file
     * cross-reference, a mermaid label with no escaping, and a generated diagram
     * that must not contain the `;` which silently breaks it.
     *
     * Optional, and absent on most records: only the records of a call that
     * crosses a participant boundary have a leg, and one emitted outside any
     * call is complete without it. A record carrying a leg always carries the
     * flow it is a leg of — `bindLeg` refuses to bind outside a flow.
     */
    leg?: string;
    /**
     * The logical unit that **declared** that leg — the caller (PRD R22).
     *
     * A field of its own rather than a prefix of the leg id, which is what it used to be:
     * the id is the label an arrow is drawn with, and a label that repeated the caller read
     * as `gateway.db/gateway.bundle.find` where `db/gateway.bundle.find` says the same thing
     * once. Written by the caller with the declaration, adopted from the wire by a callee —
     * so both ends of a call report the same source — and never read out of the method's
     * shape or taken from the process that wrote the record.
     */
    legFrom?: string;
    /**
     * The participant the caller **expected** to answer that leg (PRD R22).
     *
     * Present only on the records of the caller: the receiving end does not restate
     * it, because "who I aimed this at" is the caller's statement. This is what
     * keeps an attempt on the record even when nothing answers — a receiver that is
     * missing, failing or wired to the wrong address still appears in the observed
     * shape, and the missing receipt becomes a fact about the deployment rather than
     * an edge that cannot be drawn.
     */
    legTo?: string;
    /**
     * The leg's position in its execution: a path of counters (`1`, `1.2`) assigned
     * by the caller when it declared the call (PRD R22).
     *
     * This, not a timestamp, is what orders an execution's calls. Two records
     * emitted inside one millisecond cannot be ordered by a millisecond clock, and a
     * direction that rests on arrival order is a coin flip that looks like a
     * measurement; a counter shared by propagation has neither problem, and its
     * *paths* give the depth-first order a sequence diagram is drawn in without any
     * coordinator between processes.
     */
    legSeq?: string;
    step?: string;
    index?: number;
    status?: 'running' | 'completed' | 'failed' | 'stalled';
}

/** Intent (PRD R7). */
export interface IntentState {
    name: string;
    actor?: string;
    tenant?: string;
    priority?: number;
}

/** Inbound request detail rendered by R20. */
export interface RequestDetail {
    operation: string;
    target: string;
    headers?: Record<string, string>;
}

/** Outbound response detail rendered by R20. */
export interface ResponseDetail {
    status: number;
    headers?: Record<string, string>;
    elapsedMs?: number;
}

export interface ErrorDetail {
    type?: string;
    message?: string;
    stack?: string;
}

export interface LogRecord {
    /** Monotonic, locally minted record reference (PRD R19). */
    id: string;
    /** Epoch milliseconds. */
    time: number;
    /** Numeric level. */
    level: number;
    /** Level name, or the raw value for custom levels. */
    levelName: LevelName | string;
    msg: string;
    /** Service name — always present (PRD R20). */
    service: string;
    /**
     * Service version (PRD R20 base fields). Absent only on a record built by
     * hand: `createLogger` always carries one — the caller's option, or this
     * package's own version.
     */
    version?: string;
    /** Logger context label, e.g. component or module. */
    context?: string;
    /** Message id — correlates the record to one logical message/transaction. */
    messageId?: string;
    /** Operation name — the invoked operation. */
    operation?: string;
    /** Structured identity for grouping (PRD R3/R4); filled by Task 4. */
    fingerprint?: string;
    /** Structural form the fingerprint was computed from (PRD R1/R2). */
    template?: string;
    flow?: FlowState;
    intent?: IntentState;
    decision?: Decision;
    /**
     * Where this record sat in the logic: the branch it was emitted inside, and
     * the milestones announced at this point (PRD R26).
     *
     * Absent rather than empty when there is nothing to say, for the reason
     * `decision` is: an always-present `progress: undefined` key is visible to
     * `redactRecord`, so a pattern matching the slot would replace it with the
     * placeholder *string* and identity minting would then be reading a string
     * where it expects a mark.
     */
    progress?: Progress;
    req?: RequestDetail;
    res?: ResponseDetail;
    err?: ErrorDetail;
    refs: Refs;
    /** Remaining structured fields. */
    fields?: Record<string, unknown>;
}
