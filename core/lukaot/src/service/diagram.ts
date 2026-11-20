/**
 * Sequence diagrams drawn from what was observed (PRD R23).
 *
 * Two questions, two diagrams, one renderer:
 *
 * - **one execution** — "what did this run do?", from the calls its records carry;
 * - **one kind** — "what does this flow do?", from the union of every execution
 *   observed under that kind (`FlowLedger`).
 *
 * Both are the *observed* shape: a line exists because a record declared it, never
 * because a document said it should. What that buys is the cross-reference the whole
 * leg-identity change exists for — every arrow is labelled with the id the source
 * code declares, so `hub.transfer.deliver` on the diagram is greppable in the code
 * that makes the call. It is also what the hand-written diagrams could not do: they
 * drifted from the code silently, and nothing could tell.
 *
 * ## What an arrow says
 *
 * An arrow is one call: its caller declared it, and it is drawn to the receiver the
 * caller declared. When the receiver was *also* seen — its own record of the same leg,
 * on the other end — the answer is drawn too, so a reader gets the pair of arrows a
 * protocol diagram has always shown. Whether the receiver was seen at all is the
 * `observed` count, and it is drawn rather than hidden:
 *
 * - `->>` and `-->>` the call was answered: both ends were observed, so the request
 *   goes out and the answer comes back dashed, under the same leg id — the answer to a
 *   call is about that call, so it does not need a label of its own. The answer is drawn
 *   on the *unwind*, after every call the call itself made has been answered, which is
 *   the order a protocol diagram is read in (see {@link createUnwind}). A call whose
 *   position the emitter never reported has no known place in that unwind, so its answer
 *   is left out rather than guessed. A call whose two ends are the *same* participant is
 *   drawn once: request and answer would carry the same reader, the same label and the
 *   same step, so the pair says one thing twice ({@link hasTwoEnds}).
 * - `--x` the call was declared and **nothing answered**. That is the interesting
 *   case, and it is the one a diagram drawn from deductions would have omitted
 *   entirely: the receiver is missing, failing, or wired to the wrong address, and
 *   the deployment is what the arrow is then a fact about.
 *
 * A call whose receiver logged records but whose caller never did cannot be drawn as
 * an arrow — nobody named the caller — so it is drawn as a note over the service that
 * logged it, saying so. Inventing a caller from whichever service was seen first is
 * the failure this avoids.
 *
 * ## Determinism, and why
 *
 * The same model renders byte-identically every time: participants and arrows follow
 * the observed order, never the clock, so the generated artifact can be compared with
 * the docs page verbatim (see `test/flow`). No timestamp is drawn at all — an arrow
 * with a time on it would make the output a different string on every run.
 *
 * ## Labels cannot escape
 *
 * Every string here arrives from a process this one does not control — a service
 * name, a leg id, a note about a record — and it is pasted into a mermaid document
 * that a browser then parses. Two rules therefore hold for all of it, enforced by
 * {@link sanitiseText} rather than trusted:
 *
 * - **no `;`** — mermaid reads it as a statement separator, and the defect shipped
 *   once before this module existed;
 * - **no line break** — one label is one line.
 *
 * A participant name is stricter still: only `[A-Za-z0-9_.-]` survives, so a name
 * carrying `->>` cannot become an arrow. Two names that collapse to the same safe
 * name are disambiguated rather than merged, because merging them would draw two
 * different services as one participant.
 */

import {isLegSeq} from '../context.ts';
import type {RegionMark} from '../record.ts';
import type {FlowExecution, FlowUnion, LegEnd, LegObservation} from './flowLedger.ts';
import {attributable, comparePosition, receiverPhase} from './flowLedger.ts';

/**
 * The name standing in for a service the union never saw.
 *
 * Reachable only for a model assembled by hand or restored from a snapshot written
 * by an older version: a call with no declared end and no observed service has no
 * receiver to name, and a note still has to be drawn over *something*.
 */
const UNOBSERVED = 'unobserved';

/** Everything a mermaid participant name may contain. */
const UNSAFE_PARTICIPANT = /[^A-Za-z0-9_.-]/g;

/** One observation, plus what a reader may be told about it. */
export interface DiagramObservation extends LegObservation {
    /**
     * Extra lines to draw above the call. A reader of the local store can be shown
     * the record's withheld categories, which are never transmitted (R10).
     */
    notes?: string[];
}

/**
 * A note and the participant it was announced by (PRD R27).
 *
 * The owner is carried rather than inferred from the item, because the two differ: a call's
 * records are written by **both** ends of it, and a point a receiver's handler announced belongs
 * over the receiver, not over the caller that declared the call — which is where a note read off
 * the leg alone lands, and it reads as if the caller had done the work.
 */
export interface INote {
    /** The line to draw. */
    text: string;
    /** The participant to draw it over. */
    over: string;
}

/** One call, as the diagram draws it. */
export interface DiagramCall {
    kind: 'call';
    /** The id the source code declares, and the arrow's label. */
    leg: string;
    caller: string;
    callee: string;
    /** The phase the call was observed in, when the emitter reported one. */
    step?: string;
    notes: INote[];
    /**
     * The branches this call was observed inside, outermost first (PRD R26).
     *
     * Carried on the item rather than inferred while folding, because an answer is
     * minted by the unwind when the call closes — after the region scopes that
     * produced it — and inheriting the call's chain is what keeps a request and its
     * answer inside one `alt` block ({@link inheritRegions}).
     */
    regions?: RegionMark[];
    /** Declarations observed: one per execution, so a chatty call site is still one call. */
    count: number;
    /** Of those, the ones whose receiver was also observed. */
    observed: number;
}

/**
 * A call only its receiver's records show.
 *
 * Its caller was never observed declaring it, so no arrow can be drawn: an arrow
 * needs a source, and the only source available would be an invention.
 */
export interface DiagramReceipt {
    kind: 'receipt';
    leg: string;
    service: string;
    notes: INote[];
    /** The branches this receipt was observed inside, outermost first (PRD R26). */
    regions?: RegionMark[];
}

/**
 * The answer to a call, drawn on the arrow that carries it back.
 *
 * A receiver's own record of a leg is the receiving end of that call — a record inside
 * the leg with no declared target — so an answered call is one such a record was seen
 * for. Drawing it is what makes a request and its answer one round trip on the page,
 * which is how the flow is actually read; `observed` alone only said that someone was
 * there. The label is the leg id, because the answer to a call is about that call.
 *
 * A call to one's own participant is the one answer that is never drawn: it would be a
 * second arrow between the same two ends, saying the same thing (`hasTwoEnds`).
 */
export interface DiagramResponse {
    kind: 'response';
    leg: string;
    caller: string;
    callee: string;
    step?: string;
    notes: INote[];
    /** The branches of the call this answers (PRD R26) — see {@link inheritRegions}. */
    regions?: RegionMark[];
}

/**
 * The milestones a receiver announced while it served a call (PRD R26/R27).
 *
 * A handler's work has no record of its own: the records of a call are written by the
 * framework around the handler, so what it announces is collected when it answers and
 * travels on the answer. That makes it the *receiver's* work, and it is drawn where it
 * happened — after the request arrow, before the answer — rather than above the call,
 * which would put the receiver's work before the request that caused it.
 */
export interface DiagramProgress {
    kind: 'progress';
    /** The call whose answer carried the milestones. */
    leg: string;
    /** The participant that announced them: the receiver, not the caller. */
    service: string;
    notes: INote[];
    /**
     * The branches the receiver took while serving (PRD R26), drawn around the
     * milestones that followed the decision — the ones this record says came first are
     * left outside it — and around the calls the branch went on to make.
     */
    regions?: RegionMark[];
}

/**
 * One candidate of a decision, as the diagram draws it (PRD R27).
 *
 * Every candidate gets a branch, including the ones that were weighed and not
 * taken: those are drawn **empty**, which is the point — a reader of a failure is
 * usually looking for the alternative that was considered and refused, and a
 * diagram drawn only from what happened could not show it at all.
 */
export interface DiagramBranch {
    /** The candidate's name, which is also the `else` label. */
    name: string;
    /** Was this the branch the code took? */
    chosen: boolean;
    /**
     * Did the decision reach this candidate (PRD R27)?
     *
     * False for one declared after the branch that was taken: evaluation stops there, so its
     * predicate never ran. The arm is still drawn — the code offers it — and its label says it
     * was not weighed, because a reader must not read an alternative as one that was refused
     * (T-140).
     */
    weighed: boolean;
    /** How much was drawn inside it: one per arrow, or per receipt. */
    count: number;
    /** What was observed inside it. */
    items: DiagramItem[];
}

/**
 * A branch taken, and everything drawn inside it (PRD R26/R27).
 *
 * A wrapper rather than a pair of markers, so the span is explicit: the items under
 * a branch are *inside* it, which is why the renderer can emit an `alt` block
 * without inferring where it ends from positions.
 */
export interface DiagramRegion {
    kind: 'region';
    discriminator: string;
    branches: DiagramBranch[];
}

/** One thing the diagram draws. */
export type DiagramItem =
    | DiagramCall
    | DiagramReceipt
    | DiagramResponse
    | DiagramProgress
    | DiagramRegion;

/** The kinds of item that come straight from one observation. */
type FlatItem = DiagramCall | DiagramReceipt | DiagramResponse | DiagramProgress;

/**
 * What to draw, and nothing about where it came from.
 *
 * Holding the drawing apart from its source is what lets one renderer serve the
 * service (which has executions and unions) and the inspector (which has the local
 * records, and more to say about them).
 */
export interface DiagramModel {
    /**
     * Participants to declare, in this order. Any participant an item names and this
     * list omits is declared after these, in the order the items use it — so a model
     * assembled by hand cannot produce an undeclared participant. The builders fill it
     * from the items ({@link participantsOf}), because a participant is what a call
     * names rather than what a record happened to be filed under.
     */
    services: string[];
    /** What to draw, in the order to draw it. */
    items: DiagramItem[];
}

/**
 * How deeply a call sits inside the execution, from the position it was given.
 *
 * The leg sequence is a depth-first path of counters (`1`, `1.2`, `1.2.1`), so its number
 * of components *is* the nesting: `1.2` is a call made inside `1`. `undefined` when the
 * emitter reported no position — the one case in which the diagram cannot say where an
 * answer belongs.
 */
function nestingDepth(seq: string | undefined): number | undefined {
    return seq !== undefined && isLegSeq(seq) ? seq.split('.').length : undefined;
}

/**
 * Does this call have two ends to draw a pair between?
 *
 * A **self-hop** — the same participant on both ends — is drawn as one arrow, not two:
 * `a->>a` followed by `a-->>a` repeats the same reader, the same label and the same step,
 * and the label is all the answer arrow carries. The dashed arrow exists to show *the
 * other* participant's record of the leg, which is the one thing a reader cannot infer
 * from the request; with no other participant there is nothing to show but clutter. It is
 * what a deployment whose process carries the name of the namespace it serves has, and a
 * monolith that names nothing is where that happens most.
 *
 * Both views ask this of an end, so the two diagrams agree about which calls are
 * conversations rather than one drawing a pair where the other draws one arrow.
 */
function hasTwoEnds(end: {caller: string; callee: string}): boolean {
    return end.caller !== end.callee;
}

/**
 * What a call still owes when it closes (PRD R26/R27).
 *
 * Two things, in this order: the milestones the receiver announced while it served the call, and
 * then the answer itself. It is drawn where the call closes rather than with the request, because
 * the legs the call made are drained first ({@link createUnwind}), so a milestone pushed with the
 * request would be drawn above calls it was announced after (T-139).
 */
type Unwound = DiagramProgress | DiagramResponse;

/**
 * The calls still waiting for an answer, and where their answers are drawn.
 *
 * A call's answer arrives after every call it made has been answered — the caller is
 * blocked on its callee, which was blocked on its own — so the answers cannot be drawn
 * with their requests. The positions are what say so: they are depth-first paths, so a
 * call is finished when a later call arrives at the same or a shallower depth, and the
 * answers owed inside it go out first. That is the LIFO order the hand-written flow
 * diagrams have always been read in.
 *
 * A call whose position is unknown is at no depth at all: it closes whatever was open,
 * because nothing says it is nested inside any of it, and it is remembered without its
 * answer — an arrow in the wrong place is worse than a missing one.
 */
function createUnwind(items: DiagramItem[]): {
    /** Close every call at or below `depth`, drawing what it was owed. */
    closeFrom: (depth: number | undefined) => void;
    /** Remember that this call is open, and what it owes when it closes. */
    owes: (depth: number | undefined, owed?: readonly Unwound[]) => void;
    /** Close what is left open, at the end of the walk. */
    closeAll: () => void;
} {
    const stack: Array<{depth: number; owed: readonly Unwound[]}> = [];
    const closeFrom = (depth: number): void => {
        while (stack.length > 0 && (stack[stack.length - 1] as {depth: number}).depth >= depth) {
            const closed = stack.pop() as {depth: number; owed: readonly Unwound[]};
            items.push(...closed.owed);
        }
    };
    return {
        closeFrom: depth => closeFrom(depth ?? 0),
        owes: (depth, owed = []) =>
            stack.push({depth: depth ?? 0, owed: depth === undefined ? [] : owed}),
        closeAll: () => closeFrom(0),
    };
}

/**
 * The model of one execution, from the calls its records carry.
 *
 * A leg is one call however many records were logged inside it, so the declaration
 * count of a call in a single execution is one: several records from one call site are
 * one call, and counting them would report a chatty participant as a busy one. That
 * is the same rule the union's counters keep, so the two diagrams agree about a run.
 */
export function modelOfObservations(observations: readonly DiagramObservation[]): DiagramModel {
    const groups = new Map<string, DiagramObservation[]>();
    for (const observation of observations) {
        const group = groups.get(observation.leg);
        if (group === undefined) {
            groups.set(observation.leg, [observation]);
        } else {
            group.push(observation);
        }
    }
    const items: FlatItem[] = [];
    const ordered = [...groups.entries()]
        .map(([leg, group]) => ({leg, group}))
        .sort((a, b) =>
            comparePosition({id: a.leg, seq: a.group[0].seq}, {id: b.leg, seq: b.group[0].seq}),
        );
    const unwind = createUnwind(items);
    for (const {leg, group} of ordered) {
        // Which end wrote a record is the **phase** it was written in (PRD R26/R27): a receiver
        // adopts the identity the caller sent, so its answer carries the caller's target too and
        // `to` cannot tell the two apart. A record with no phase is read the old way — a record
        // with no declared receiver is the receiving end of the call, and is the only evidence
        // that the call reached anyone.
        const servedIt = (observation: DiagramObservation): boolean =>
            receiverPhase(observation.phase) ||
            (observation.phase === undefined && observation.to === undefined);
        const receiverSide = group.filter(servedIt);
        const callerSide = group.filter(observation => !servedIt(observation));
        const answered = new Set(receiverSide.map(observation => observation.service));
        // A milestone is drawn where it was announced, which the observation says by its own
        // end — a record with a declared target was written by the caller (`authorOf`).
        const declaredTo = group.find(o => o.to !== undefined)?.to;
        const writtenBy = (observation: DiagramObservation): string =>
            authorOf(observation, declaredTo);
        // What a record says about the leg itself is drawn with the call, from either end:
        // a withholding note is about the record and belongs above the arrow that carried it.
        const notes = group.flatMap(observation =>
            (observation.notes ?? []).map(text => ({text, over: writtenBy(observation)})),
        );
        // A *point*, though, is a moment in someone's work, so it is drawn by whose work it was:
        // the caller announces its own before it calls, the receiver the ones it served the call
        // with — those are pushed below, between the arrows.
        const said = (observation: DiagramObservation): INote[] =>
            (observation.points ?? []).map(name => ({
                text: `point: ${name}`,
                over: writtenBy(observation),
            }));
        notes.push(...callerSide.flatMap(said));
        // The branches the *caller* was in when it made the call belong *around* the arrow:
        // a call made inside a branch is inside it, which is the whole point of drawing the
        // block — a router that calls A in one branch and B in the other. A branch the
        // *receiver* took while answering is a different fact: the call was not made inside
        // it, it was served inside it, so it is drawn between the arrows instead, around the
        // milestones that followed it.
        const regions = callerSide.find(o => o.regions !== undefined)?.regions;
        const milestones = receiverSide.flatMap((observation): DiagramProgress[] => {
            const servedBy = declaredTo ?? observation.service;
            const said = (observation.points ?? []).map(name => ({
                text: `point: ${name}`,
                over: servedBy,
            }));
            const chain = observation.regions;
            if (said.length === 0 && chain === undefined) {
                return [];
            }
            const opened = (entries: INote[], marks?: RegionMark[]): DiagramProgress => ({
                kind: 'progress',
                leg,
                service: servedBy,
                notes: entries,
                ...(marks === undefined ? {} : {regions: marks}),
            });
            // What the handler announced before the decision is drawn before the block: the
            // branch cannot have caused work that was already done (PRD R27).
            const before = Math.max(
                0,
                Math.min(said.length, chain?.[0]?.pointsBefore ?? said.length),
            );
            return [
                ...(before > 0 ? [opened(said.slice(0, before))] : []),
                ...(before < said.length || chain !== undefined
                    ? [opened(said.slice(before), chain)]
                    : []),
            ];
        });
        // Keyed by the caller *and* the callee, both read off the call: the leg id is the
        // method the call reached its callee with, and the identity declares the unit that
        // made the call (`from`) and the receiver it aimed at (`to`), so an arrow is a fact
        // about the call rather than about which process happened to write the record. The
        // writer is information — one process hosts many namespaces, and in development a
        // whole suite — so an identity taken from it would draw every call of a monolith from
        // one participant. A declaration that named no caller draws nothing: the source of an
        // arrow is not something to infer, and the receipt below still shows the call reached
        // someone.
        const pairs = new Map<string, {caller: string; callee: string; step?: string}>();
        for (const observation of group) {
            if (observation.to === undefined || observation.from === undefined) {
                continue;
            }
            const caller = observation.from;
            const key = `${caller}\u0000${observation.to}`;
            if (!pairs.has(key)) {
                pairs.set(key, {
                    caller,
                    callee: observation.to,
                    step: observation.step,
                });
            }
        }
        if (pairs.size === 0) {
            // A receipt has no arrows to straddle, so the block wraps it wherever the record
            // that made it sat: it takes the chain of either end. The receiver's milestones
            // are pushed first so the block opens with the work and not with the note that
            // says the call arrived, and closes once there rather than twice.
            const madeIn = group.find(o => o.regions !== undefined)?.regions;
            items.push(...milestones.filter(milestone => milestone.notes.length > 0));
            items.push({
                kind: 'receipt',
                leg,
                service: group[0].service,
                notes,
                ...(madeIn ? {regions: madeIn} : {}),
            });
            continue;
        }
        const answeredByReceipt = attributable(pairs.size, answered.size);
        const depth = nestingDepth(group[0].seq);
        // Whatever this call is nested inside is still open, and an answer is owed by the
        // innermost call first: the position is what says how far out this call sits.
        unwind.closeFrom(depth);
        for (const pair of pairs.values()) {
            items.push({
                kind: 'call',
                leg,
                caller: pair.caller,
                callee: pair.callee,
                step: pair.step,
                // The leg's records are drawn with the call they belong to, on every
                // arrow it produced: a reused id is reported as the reuse it is rather
                // than having its notes silently dropped from all but one arrow.
                notes,
                count: 1,
                observed: answeredByReceipt ? 1 : 0,
                ...(regions ? {regions} : {}),
            });
        }
        // `attributable` holds only for a single declared target that something answered,
        // so at most one answer is ever owed — and it is drawn when this call closes, not
        // here, because the calls it made answer first. A self-hop is owed none.
        //
        // What the receiver announced while it served is owed with the answer, and drawn where
        // the call closes for the same reason: the legs this call made are drained first (LIFO,
        // see createUnwind), so a milestone pushed here would be drawn above calls it was
        // announced after — which is what the commander dispatch showed (T-139). It goes before
        // the answer, so a request and its answer still read as one round trip.
        unwind.owes(depth, [
            ...milestones,
            ...(answeredByReceipt
                ? [...pairs.values()].filter(hasTwoEnds).map(pair => ({
                      kind: 'response' as const,
                      leg,
                      caller: pair.caller,
                      callee: pair.callee,
                      step: pair.step,
                      notes: [],
                  }))
                : []),
        ]);
    }
    unwind.closeAll();
    // An answer belongs to the call it answers and is drawn inside the same block, and
    // the branches become a tree: the items under a branch are the ones observed inside
    // it (PRD R27).
    inheritRegions(items);
    return {services: participantsOf(items), items: foldRegions(items)};
}

/** The model of one execution the ledger retains. */
export function modelOfExecution(execution: FlowExecution): DiagramModel {
    return modelOfObservations(execution.observations);
}

/**
 * The model of one flow kind: every call observed under it, over every execution.
 *
 * The counts are what make this diagram different from one execution's: `x12` is a
 * call twelve executions made, and `x12 (11 answered)` is a receiver that failed once
 * — which is the question a reader brings to the union.
 */
export function modelOfUnion(union: FlowUnion): DiagramModel {
    const items: FlatItem[] = [];
    const unwind = createUnwind(items);
    for (const leg of union.legs) {
        if (leg.ends.length === 0) {
            items.push({
                kind: 'receipt',
                leg: leg.leg,
                service: leg.services[0] ?? UNOBSERVED,
                notes: [],
            });
            continue;
        }
        const depth = nestingDepth(leg.seq);
        unwind.closeFrom(depth);
        for (const end of leg.ends) {
            // One arrow per branch the pair was declared in, each carrying that
            // branch's own counts: a call declared under two different outcomes across
            // two executions is two arrows with two counts, which is the question a
            // reader brings to a union. A pair never observed inside a branch is drawn
            // once, flat — which is also what the missing `else` would have said.
            for (const placement of placementsOfEnd(end)) {
                items.push({
                    kind: 'call',
                    leg: leg.leg,
                    caller: end.caller,
                    callee: end.callee,
                    step: leg.step,
                    notes: [],
                    count: placement.count,
                    observed: placement.observed,
                    ...(placement.regions.length > 0 ? {regions: placement.regions} : {}),
                });
            }
        }
        // An end that was answered in at least one execution owes an answer here; the
        // others stay unanswered, which is what their counts already say. A self-hop is
        // owed none of them, as it is in one execution's diagram.
        //
        // The answers are drawn where the unwind puts them rather than inside the
        // branch, because a union's pair may be declared in more than one branch and
        // there is then no single block an answer to the pair belongs in. Recorded as a
        // limitation rather than papered over.
        unwind.owes(
            depth,
            leg.ends
                .filter(end => end.observed > 0 && hasTwoEnds(end))
                .map(end => ({
                    kind: 'response' as const,
                    leg: leg.leg,
                    caller: end.caller,
                    callee: end.callee,
                    step: leg.step,
                    notes: [],
                })),
        );
    }
    unwind.closeAll();
    return {services: participantsOf(items), items: foldRegions(items)};
}

/** One branch a call end was declared in, with the counts that belong to it. */
function placementsOfEnd(end: LegEnd): Array<{
    regions: RegionMark[];
    count: number;
    observed: number;
}> {
    if (end.branches === undefined || end.branches.length === 0) {
        return [{regions: [], count: end.count, observed: end.observed}];
    }
    return end.branches.map(branch => ({
        regions: [
            {
                // The id is the discriminator, not a position: the same decision taken
                // in every execution of a flow is one `alt` block, and a union has no
                // single position to key a block on (the execution diagram keys on the
                // path of counters, because there one run's nesting is the question).
                id: branch.discriminator,
                discriminator: branch.discriminator,
                candidates: branch.candidates,
                chosen: branch.chosen,
            },
        ],
        count: branch.count,
        observed: branch.observed,
    }));
}

/** One label: no statement separator, no line break, no run of spaces. */
function sanitiseText(text: string): string {
    return text
        .replace(/[;\r\n]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * The mermaid name of each participant, disambiguated, in first-seen order.
 *
 * The order of the returned map is the order they are declared in, and repeated names
 * are dropped rather than renamed: two services that collapse to the same safe name
 * (`a b` and `a_b`) are numbered apart, but one service named twice is one participant.
 */
function participantNames(services: readonly string[]): Map<string, string> {
    const assigned = new Map<string, string>();
    const taken = new Set<string>();
    for (const service of services) {
        if (assigned.has(service)) {
            continue;
        }
        const base = service.replace(UNSAFE_PARTICIPANT, '_') || UNOBSERVED;
        let name = base;
        for (let suffix = 2; taken.has(name); suffix++) {
            name = `${base}_${suffix}`;
        }
        assigned.set(service, name);
        taken.add(name);
    }
    return assigned;
}

/** The participants an item names, in the order it names them. */
function participantsIn(item: DiagramItem): string[] {
    if (item.kind === 'region') {
        return item.branches.flatMap(branch =>
            branch.items.flatMap(entry => participantsIn(entry)),
        );
    }
    if (item.kind === 'progress' || item.kind === 'receipt') {
        return [item.service];
    }
    return [item.caller, item.callee];
}

/**
 * The participants a model declares, in the order the calls first name them.
 *
 * Read from the items rather than from the records' services: a participant is the logical
 * unit a call names — its caller's namespace and the receiver it aimed at — and a record
 * that carries no call names no unit at all. A flow whose process writes every record under
 * one service name therefore draws the units it travelled through, which is the same picture
 * a microservice deployment of it draws.
 */
function participantsOf(items: readonly DiagramItem[]): string[] {
    const order: string[] = [];
    const known = new Set<string>();
    for (const item of items) {
        for (const participant of participantsIn(item)) {
            if (!known.has(participant)) {
                known.add(participant);
                order.push(participant);
            }
        }
    }
    return order;
}

/**
 * The participant a note's author is.
 *
 * A leg's records come from both ends of it. The caller writes the declaration — the record that
 * names a target — so it is the caller's own name on it. The receiver writes the receipt and the
 * answer, which declare no target ("who I expected to answer" is the caller's statement), and the
 * receiver it was, is the target the *caller* declared: read from the leg's declaration in the same
 * group, which is the only statement of it that does not depend on how a leg id happens to be spelt.
 * A receipt with no declaration at all has nothing but the service that logged it, which is honest
 * for a single-service deployment and is all the local store can offer.
 */
function authorOf(observation: LegObservation, declaredTo: string | undefined): string {
    if (observation.to !== undefined) {
        return observation.from ?? observation.to;
    }
    return declaredTo ?? observation.service;
}

/**
 * The cast a phase band spans: everyone, or the only participant there is.
 *
 * Reached with a non-empty order by construction — the band is drawn for a call, and a
 * call's two ends were added to the order before this.
 */
function spanOf(order: readonly string[], nameOf: (participant: string) => string): string {
    return order.length > 1
        ? `${nameOf(order[0])}, ${nameOf(order[order.length - 1])}`
        : nameOf(order[0]);
}

/** The arrow for a call: solid when it was answered, crossed when nothing did. */
function arrowOf(call: DiagramCall): string {
    return call.observed === 0 ? '--x' : '->>';
}

/**
 * What the arrow says about how often it was seen.
 *
 * The normal case — declared once in the model, answered — says nothing: a diagram
 * where every arrow carried `x1` would be harder to read and no more informative. The
 * departures are the ones worth the ink.
 */
function suffixOf(call: DiagramCall): string {
    if (call.count === 1) {
        return call.observed === 0 ? ' (no receipt)' : '';
    }
    return call.observed === call.count
        ? ` x${call.count}`
        : ` x${call.count} (${call.observed} answered)`;
}

/**
 * Give every answer the branches of the call it answers (PRD R26).
 *
 * An answer is minted by the unwind when the call closes, so it is created after
 * the region scopes that produced the call have been left. An answer belongs to its
 * call, so it is drawn inside the same `alt` block rather than after it: a pair of
 * arrows split across a block boundary reads as two different conversations.
 */
function inheritRegions(items: readonly FlatItem[]): void {
    const branches = new Map<string, RegionMark[] | undefined>();
    for (const item of items) {
        if (item.kind === 'response') {
            continue;
        }
        const key = callKey(item);
        if (item.kind === 'call') {
            branches.set(key, item.regions);
        }
    }
    for (const item of items) {
        if (item.kind === 'response' && item.regions === undefined) {
            item.regions = branches.get(callKey(item));
        }
    }
}

/** One call's identity, as the chain lookup and the aggregation key it. */
function callKey(item: {leg: string; caller?: string; callee?: string}): string {
    return `${item.leg}\u0000${item.caller ?? ''}\u0000${item.callee ?? ''}`;
}

/**
 * Nest the items under the branches they were observed inside (PRD R26/R27).
 *
 * A chain is a path of counters (`3`, `3.1`), so the fold is a walk: the branches an
 * item is *not* inside are closed, the ones it is inside are opened, and the item
 * joins the innermost. Every candidate gets a branch whether or not it was taken,
 * which is how the picture shows an alternative that was weighed and refused.
 */
function foldRegions(items: readonly FlatItem[]): DiagramItem[] {
    const root: DiagramItem[] = [];
    const open: Array<{mark: RegionMark; region: DiagramRegion; branch: DiagramBranch}> = [];
    for (const item of items) {
        const chain = item.regions ?? [];
        let common = 0;
        while (
            common < open.length &&
            common < chain.length &&
            open[common].mark.id === chain[common].id
        ) {
            common++;
        }
        // Everything below the common prefix is closed: those branches ended.
        open.length = common;
        for (let index = 0; index < chain.length; index++) {
            const mark = chain[index];
            let region = open[index]?.region;
            if (region === undefined) {
                region = {
                    kind: 'region',
                    discriminator: mark.discriminator,
                    branches: branchesOf(mark),
                };
                const enclosing = index === 0 ? undefined : open[index - 1].branch.items;
                (enclosing ?? root).push(region);
            }
            // The branch is chosen *per item*, not once per region: one execution's
            // records all carry the same branch, but a union's block hosts the arrows of
            // every branch it saw and they arrive interleaved by position. Selecting it
            // for the already-open levels too is what keeps the second branch's arrow out
            // of the first branch. `branchesOf` always declares the branch that ran, so
            // the lookup cannot come up empty.
            const branch = region.branches.find(
                candidate => candidate.name === mark.chosen,
            ) as DiagramBranch;
            open[index] = {mark, region, branch};
        }
        const innermost = open[open.length - 1];
        if (innermost === undefined) {
            root.push(item);
        } else {
            innermost.branch.items.push(item);
            // A milestone is not an arrow: the count inside a branch is what it holds, and an
            // empty block a receiver's branch leaves behind still has to be drawn (that is
            // where a branch carries a point at all), so counting items would report a branch
            // that made no call as one that did.
            if (item.kind !== 'progress') {
                innermost.branch.count++;
            }
        }
    }
    return root;
}

/** Every candidate as a branch, in evaluation order, with the chosen one marked. */
function branchesOf(mark: RegionMark): DiagramBranch[] {
    const names = mark.candidates.includes(mark.chosen)
        ? mark.candidates
        : [...mark.candidates, mark.chosen];
    // A decision stops at the branch it takes, so every candidate after it had its predicate
    // skipped: it is drawn — the code offers it — and marked as not weighed. A decision that
    // matched nothing (`none`) evaluated them all, and `none` itself is appended last.
    const reached = names.indexOf(mark.chosen);
    return names.map((name, index) => ({
        name,
        chosen: name === mark.chosen,
        weighed: reached < 0 || index <= reached,
        count: 0,
        items: [],
    }));
}

/**
 * The discriminators a run was observed inside, in first-observation order (PRD R26).
 *
 * Read from the observations rather than from the diagram, because a route that has to
 * *say* what it drew should not have to walk a render to find out — and because the
 * model is the picture, not the record.
 */
export function discriminatorsOf(
    observations: readonly {regions?: readonly {discriminator: string}[]}[],
): string[] {
    return [
        ...new Set(
            observations.flatMap(observation =>
                (observation.regions ?? []).map(mark => mark.discriminator),
            ),
        ),
    ];
}

/** The milestones a run reported, in first-observation order (PRD R26). */
export function pointsOf(observations: readonly {points?: readonly string[]}[]): string[] {
    return [...new Set(observations.flatMap(observation => observation.points ?? []))];
}

/**
 * Render a model as a mermaid sequence diagram.
 *
 * `autonumber` numbers the arrows — and only the arrows, so a `Note` never takes a
 * number — which is what lets a reader say "arrow 7" and be understood.
 */
export function renderSequence(model: DiagramModel): string {
    const declared = [...model.services];
    for (const item of model.items) {
        declared.push(...participantsIn(item));
    }
    const names = participantNames(declared);
    const order = [...names.keys()];
    // Every name an item uses is in `names` by construction: the loop above pushed each
    // of them, and `participantNames` assigns one name per service it is handed.
    const nameOf = (participant: string): string => names.get(participant) as string;
    const lines = ['sequenceDiagram', '    autonumber'];
    for (const participant of order) {
        lines.push(`    participant ${nameOf(participant)}`);
    }
    drawItems(model.items, lines, {phaseNumber: 0}, order, nameOf);
    return `${lines.join('\n')}\n`;
}

/** What the drawing remembers between items. */
interface DrawState {
    /** The phase band currently open, when one is. */
    phase?: string;
    /** How many bands have been drawn, so the next one is numbered after them. */
    phaseNumber: number;
    /**
     * The participant the drawing last named.
     *
     * A region whose arms are all empty needs a participant to hang its "nothing observed" note
     * on, and the one a reader is already looking at beats an arbitrary choice.
     */
    last?: string;
}

/**
 * Draw items in order, recursing into the branches of a region (PRD R27).
 *
 * A region is mermaid's `alt`/`else`/`end`: the branch taken carries the calls that
 * were observed inside it, and the branches that were weighed and not taken are drawn
 * empty — which is the point, because a reader of a failure is usually looking for
 * the alternative that was considered and refused. A region with no alternatives is a
 * phase, and phases are still drawn as the bands over the participants.
 *
 * **Mermaid cannot render a section with nothing in it when it is the last one before `end`** —
 * the whole block stops drawing. So the arms are ordered to end with one that has something in it:
 * the empty ones first and the taken one last, which is the arm carrying the calls. Nothing about the
 * question is lost, because every candidate keeps its label and the ones the decision never reached
 * say so; and when *no* arm has anything to draw, the last one is given a note saying so, because an
 * `alt` block drawn around an exception has to show that it happened.
 */
function drawsSomething(item: DiagramItem): boolean {
    return item.kind === 'region'
        ? item.branches.some(branch => branch.items.some(drawsSomething))
        : item.kind !== 'progress' || item.notes.length > 0;
}

function drawItems(
    items: readonly DiagramItem[],
    lines: string[],
    state: DrawState,
    order: readonly string[],
    nameOf: (participant: string) => string,
): void {
    for (const item of items) {
        if (item.kind === 'region') {
            // Every branch is named, the first one included: `alt` opens the block and
            // `else` introduces each alternative after it, so a reader sees the question and
            // then each candidate by name, in the order the code declared them. A candidate the
            // decision never reached says so in its label: the arm is drawn because the code
            // offers it, and a reader is told it was not weighed rather than left to read it as
            // one that was refused (T-140).
            //
            // The arms are then ordered for mermaid's sake, not the code's: the empty ones first
            // and the ones with something in them last, so `end` is never preceded by an empty
            // section. Only the *order* changes — the labels still carry the declared candidates.
            const arms = [
                ...item.branches.filter(branch => !branch.items.some(drawsSomething)),
                ...item.branches.filter(branch => branch.items.some(drawsSomething)),
            ];
            const nothingToDraw = !arms.some(branch => branch.items.some(drawsSomething));
            arms.forEach((branch, index) => {
                const name = branch.weighed ? branch.name : `${branch.name} — not weighed`;
                lines.push(
                    index === 0
                        ? `    alt ${sanitiseText(`${item.discriminator} = ${name}`)}`
                        : `    else ${sanitiseText(name)}`,
                );
                if (nothingToDraw && index === arms.length - 1) {
                    const over = state.last ?? order[0];
                    lines.push(`    Note over ${nameOf(over)}: nothing observed yet`);
                }
                drawItems(branch.items, lines, state, order, nameOf);
            });
            lines.push('    end');
            continue;
        }
        if (item.kind === 'call' && item.step !== undefined && item.step !== state.phase) {
            // A phase band, not a call: the steps repeat across participants, and the
            // band is what turns a flat list of calls into the process a reader knows.
            state.phase = item.step;
            state.phaseNumber++;
            lines.push(
                `    Note over ${spanOf(order, nameOf)}: PHASE ${state.phaseNumber}: ${sanitiseText(item.step)}`,
            );
        }
        for (const note of item.notes) {
            lines.push(`    Note over ${nameOf(note.over)}: ${sanitiseText(note.text)}`);
        }
        if (item.kind === 'call') {
            state.last = item.caller;
            lines.push(
                `    ${nameOf(item.caller)}${arrowOf(item)}${nameOf(item.callee)}: ${sanitiseText(item.leg)}${suffixOf(item)}`,
            );
        } else if (item.kind === 'response') {
            // The answer travels back the way the request came, dashed so the two are
            // told apart at a glance, and numbered by `autonumber` like any other message.
            state.last = item.caller;
            lines.push(
                `    ${nameOf(item.callee)}-->>${nameOf(item.caller)}: ${sanitiseText(item.leg)}`,
            );
        } else if (item.kind === 'receipt') {
            lines.push(
                `    Note over ${nameOf(item.service)}: ${sanitiseText(item.leg)} — received, no caller was observed`,
            );
        }
        // A receiver's milestones are its notes and nothing else: they were drawn above, in
        // the order the handler announced them, inside the branch when one followed them.
    }
}
