import type {
    CheckpointFn,
    DecideFn,
    IMeta,
    IProgressPoint,
    IProgressRegion,
    IRegionMark,
} from '@feasibleone/blong/types';
import {vocabulary} from '@feasibleone/semantic-log/attachable';

/**
 * The branches the calling scope is running inside, named the way `$meta` names them.
 *
 * Names only, and never the log's own mark: the mark carries the position it was minted at,
 * which describes a place in *this* process' execution. An entry that travelled here from
 * another process over a call would bring a position that means nothing here, while the three
 * names still say exactly which branches it sat in — which is all a report groups by.
 */
const regionMarks = (): IRegionMark[] | undefined => {
    const chain = vocabulary.currentRegions();
    if (chain === undefined || chain.length === 0) {
        return undefined;
    }
    return chain.map(region => ({
        discriminator: region.discriminator,
        candidates: region.candidates,
        chosen: region.chosen,
    }));
};

/**
 * Reports a checkpoint into `$meta.progress`, and announces it as a progress point
 * (PRD R26).
 *
 * Uses `this` binding — works correctly when called as
 * $meta.checkpoint?.('name', data) with optional chaining.
 */
const checkpoint: CheckpointFn = function (this: IMeta, name: string, data?: unknown): void {
    const regions = regionMarks();
    const entry: IProgressPoint = {
        kind: 'point',
        name,
        ...(data === undefined ? {} : {data}),
        timestamp: Date.now(),
        ...(regions === undefined ? {} : {regions}),
    };
    (this.progress ??= []).push(entry);
    // The same moment is announced to the log, so a checkpoint reaches the record the
    // sequence diagram is drawn from rather than only the list a test asserts on. The
    // vocabulary degrades to nothing where no emitter is attached, so this is one call
    // and never a way for a dispatch path to import the emitter's ambient scope (F-197).
    vocabulary.point(name, data);
};

/**
 * Takes a branch, and keeps what it was and which one was taken on the invocation that took
 * it (PRD R11/R26).
 *
 * `this`-bound like {@link checkpoint}. The branch's `run` is *wrapped* rather than the
 * predicates re-evaluated: a predicate with a side effect must run exactly once, and the
 * decision recorded has to be the one the code actually took. A branch whose `run` throws
 * records nothing — the entry is withdrawn before the throw propagates, because a decision
 * that never completed is not a decision.
 */
const decide: DecideFn = function <T>(
    this: IMeta,
    discriminator: string,
    values: Record<string, unknown>,
    branches: ReadonlyArray<{
        name: string;
        when: (values: Record<string, unknown>) => boolean;
        run: () => T;
    }>,
): T | undefined {
    let chosen: string | undefined;
    const wrapped = branches.map(branch => ({
        ...branch,
        run: () => {
            chosen = branch.name;
            return branch.run();
        },
    }));
    // The entry is pushed *before* the branch runs, which is what puts it where the
    // announcement order wants it: the points the branch announces come after it in the
    // array, and a report that groups by those points therefore draws them inside the
    // branch. Nothing else in the entry is known yet, so `chosen` is filled in below.
    const outer = regionMarks();
    const entry: IProgressRegion = {
        kind: 'region',
        discriminator,
        candidates: branches.map(branch => branch.name),
        chosen: '',
        values,
        ...(outer === undefined ? {} : {regions: outer}),
    };
    const held = this.progress;
    const progress = (this.progress ??= []);
    progress.push(entry);
    try {
        const result = vocabulary.decide<T>(discriminator, values, wrapped);
        entry.chosen = chosen ?? 'none';
        return result;
    } catch (error) {
        // A branch whose `run` throws records nothing, which is the rule this recorder has
        // always kept: a decision that never completed is not a decision. The entry was
        // pushed early, so it is withdrawn again — and, where the array was this call's own,
        // the slot goes with it, so a throwing branch leaves `$meta.progress` exactly as
        // absent as it found it. The throw still propagates.
        const at = progress.lastIndexOf(entry);
        if (at !== -1) progress.splice(at, 1);
        if (held === undefined && progress.length === 0) delete this.progress;
        throw error;
    }
};

/**
 * Attach the framework's progress-point handles to a dispatch's `$meta`.
 *
 * `decide` is attached in **every** mode: it selects a branch, so a missing one would skip
 * the work rather than cost a note. `checkpoint` is attached only where points are
 * recorded, which is what keeps its `?.` call free in production.
 */
export function createAttachCheckpoint(
    mode: 'test' | 'debug' | 'production',
): (meta: IMeta) => void {
    const recording = mode !== 'production';
    return (meta: IMeta): void => {
        meta.decide ??= decide;
        if (recording) {
            meta.checkpoint ??= checkpoint;
        }
    };
}
