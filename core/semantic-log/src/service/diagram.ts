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
 * caller declared. Whether the receiver was *also* seen — its own records, on the
 * other end — is the `observed` count, and it is drawn rather than hidden:
 *
 * - `->>` the call was answered: both ends were observed.
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

import type {FlowExecution, FlowUnion, LegObservation} from './flowLedger.ts';
import {comparePosition} from './flowLedger.ts';

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
     * Extra lines to draw above the call. The service never has any — it sees no
     * branch rationale (R10) — while a reader of the local store can be shown the
     * record's own `decision` and its withheld fields.
     */
    notes?: string[];
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
    notes: string[];
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
    notes: string[];
}

/** One thing the diagram draws. */
export type DiagramItem = DiagramCall | DiagramReceipt;

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
     * assembled by hand cannot produce an undeclared participant.
     */
    services: string[];
    /** What to draw, in the order to draw it. */
    items: DiagramItem[];
}

/**
 * The model of one execution, from the calls its records carry.
 *
 * A leg is one call however many records were logged inside it, so the declaration
 * count of a call in a single execution is one: several records from one call site are
 * one call, and counting them would report a chatty participant as a busy one. That
 * is the same rule the union's counters keep, so the two diagrams agree about a run.
 */
export function modelOfObservations(
    observations: readonly DiagramObservation[],
    services: readonly string[] = [],
): DiagramModel {
    const groups = new Map<string, DiagramObservation[]>();
    for (const observation of observations) {
        const group = groups.get(observation.leg);
        if (group === undefined) {
            groups.set(observation.leg, [observation]);
        } else {
            group.push(observation);
        }
    }
    const items: DiagramItem[] = [];
    const ordered = [...groups.entries()]
        .map(([leg, group]) => ({leg, group}))
        .sort((a, b) =>
            comparePosition({id: a.leg, seq: a.group[0].seq}, {id: b.leg, seq: b.group[0].seq}),
        );
    for (const {leg, group} of ordered) {
        // A record with no declared receiver is the receiving end of the call: this is
        // the only evidence that the call reached anyone.
        const answered = new Set(group.filter(o => o.to === undefined).map(o => o.service));
        const notes = group.flatMap(o => o.notes ?? []);
        const pairs = new Map<string, {caller: string; callee: string; step?: string}>();
        for (const observation of group) {
            if (observation.to !== undefined) {
                const key = `${observation.service}\u0000${observation.to}`;
                if (!pairs.has(key)) {
                    pairs.set(key, {
                        caller: observation.service,
                        callee: observation.to,
                        step: observation.step,
                    });
                }
            }
        }
        if (pairs.size === 0) {
            items.push({kind: 'receipt', leg, service: group[0].service, notes});
            continue;
        }
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
                observed: answered.has(pair.callee) ? 1 : 0,
            });
        }
    }
    return {services: [...services], items};
}

/** The model of one execution the ledger retains. */
export function modelOfExecution(execution: FlowExecution): DiagramModel {
    return modelOfObservations(execution.observations, execution.services);
}

/**
 * The model of one flow kind: every call observed under it, over every execution.
 *
 * The counts are what make this diagram different from one execution's: `x12` is a
 * call twelve executions made, and `x12 (11 answered)` is a receiver that failed once
 * — which is the question a reader brings to the union.
 */
export function modelOfUnion(union: FlowUnion): DiagramModel {
    const items: DiagramItem[] = [];
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
        for (const end of leg.ends) {
            items.push({
                kind: 'call',
                leg: leg.leg,
                caller: end.caller,
                callee: end.callee,
                step: leg.step,
                notes: [],
                count: end.count,
                observed: end.observed,
            });
        }
    }
    return {services: [...union.services], items};
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
    return item.kind === 'call' ? [item.caller, item.callee] : [item.service];
}

/** The participant a note or an arrow about this item belongs to. */
function sourceOf(item: DiagramItem): string {
    return item.kind === 'call' ? item.caller : item.service;
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
    let phase: string | undefined;
    let phaseNumber = 0;
    for (const item of model.items) {
        if (item.kind === 'call' && item.step !== undefined && item.step !== phase) {
            // A phase band, not a call: the steps repeat across participants, and the
            // band is what turns a flat list of calls into the process a reader knows.
            phase = item.step;
            phaseNumber++;
            lines.push(
                `    Note over ${spanOf(order, nameOf)}: PHASE ${phaseNumber}: ${sanitiseText(phase)}`,
            );
        }
        for (const note of item.notes) {
            lines.push(`    Note over ${nameOf(sourceOf(item))}: ${sanitiseText(note)}`);
        }
        if (item.kind === 'call') {
            lines.push(
                `    ${nameOf(item.caller)}${arrowOf(item)}${nameOf(item.callee)}: ${sanitiseText(item.leg)}${suffixOf(item)}`,
            );
        } else {
            lines.push(
                `    Note over ${nameOf(item.service)}: ${sanitiseText(item.leg)} — received, no caller was observed`,
            );
        }
    }
    return `${lines.join('\n')}\n`;
}
