/**
 * Decision and branch rationale capture (PRD R11).
 *
 * R11 asks for a branch's *reason* to live in the record, deterministically
 * rather than as prose: the discriminator consulted, the candidate branches
 * considered, and the one taken. This module produces that rationale; the
 * record already carries a `decision` slot (T2) and the renderer already prints
 * it (T6), so all that is left is to fill the slot for the next record — which
 * the logger does, at emit time.
 *
 * Three properties are deliberate:
 *
 * 1. **Evaluation order is preserved verbatim.** `candidates` lists every branch
 *    in the order it was considered, false predicates included, so the recorded
 *    rationale can be replayed without reading source — R11's acceptance.
 * 2. **A decision never changes control flow.** Only the chosen branch's `run`
 *    is executed, and a predicate that throws is *not* swallowed: the error
 *    propagates unchanged and no rationale is recorded for a decision that never
 *    completed, because a half-evaluated branch is not a decision. Reporting
 *    `none` instead would turn a real failure into a silently recorded non-choice.
 * 3. **The rationale is ordinary retained data.** It is recorded while the
 *    record is assembled — before redaction runs — so `decision.*` is a
 *    channel a caller's `redact` patterns can withhold like any other. Attaching it after `redactRecord`
 *    would put it beyond the caller's `redact` patterns, the same bypass that
 *    was closed for the withheld bag.
 */

import {recordDecision, withRegion} from './context.ts';
import type {Decision} from './record.ts';

export interface Branch<T> {
    /** Stable branch name, recorded even when the branch is not taken. */
    name: string;
    /** Predicate over `values`. Evaluated in array order. */
    when: (values: Record<string, unknown>) => boolean;
    /** Runs when this branch is chosen. */
    run: () => T;
}

/**
 * Evaluate `branches` in order, run the first whose `when` is true, and record
 * the rationale for the next emitted record. Returns `undefined` when no
 * branch matches — an outcome that is itself recorded as `none`.
 *
 * The rationale is left pending in the ambient context rather than emitted
 * here: `decide` is a pure branch helper that knows nothing about a logger, and
 * the record it explains may be written arbitrarily later. The next record in
 * this async scope takes it (once — see `takeDecision`); if no record follows,
 * the rationale is dropped with the scope and never surfaces. A predicate that
 * throws propagates to the caller and records nothing.
 */
export function decide<T>(
    discriminator: string,
    values: Record<string, unknown>,
    branches: ReadonlyArray<Branch<T>>,
): T | undefined {
    const candidates = branches.map(branch => branch.name);
    // Choose first, then record, then run: the evaluation order is the array's,
    // a predicate that throws still records nothing (the loop never completes),
    // and `chosen` is known before the rationale is staged.
    let chosen: string | undefined;
    let taken: Branch<T> | undefined;
    for (const branch of branches) {
        if (branch.when(values)) {
            chosen = branch.name;
            taken = branch;
            break;
        }
    }
    const decision: Decision = {
        discriminator,
        candidates,
        chosen: chosen ?? 'none',
        values,
    };
    // The rationale is staged *before* the branch runs, so a record the branch
    // emits carries both the branch (through the region) and the rationale, and
    // so a branch that throws leaves the rationale pending for the record that
    // reports the failure. It is staged outside the region scope on purpose:
    // `recordDecision` uses `enterWith`, and a store entered inside the region
    // would be discarded with it, losing a rationale no record consumed.
    recordDecision(decision);
    if (taken === undefined) {
        return undefined;
    }
    // The branch's work is a region (PRD R26/R27): every record emitted inside it
    // is stamped with the branch, which is what lets the sequence diagram draw
    // the `alt` block around the calls the branch made rather than around the
    // single call a rationale happened to land on.
    //
    // The **mark** carries every candidate the code declared, in the order it declared them,
    // and a reader is told which of them the decision never reached rather than being shown a
    // shorter list: a branch after the chosen one had its predicate skipped, and a drawing that
    // omitted it entirely would hide an alternative the code offers. The position of the chosen
    // candidate is the whole of what is needed — evaluation stops there — so the mark needs no
    // extra field, and the renderer marks the arms after it (T-140).
    return withRegion({discriminator, candidates, chosen: taken.name}, () => taken.run());
}
