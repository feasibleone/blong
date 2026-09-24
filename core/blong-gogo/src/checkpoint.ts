import type {CheckpointFn, DecideFn, IMeta} from '@feasibleone/blong/types';
import {vocabulary} from '@feasibleone/semantic-log/attachable';

/**
 * Records a checkpoint in the $meta.checkpoints array, and announces it as a progress
 * point (PRD R26).
 *
 * Uses `this` binding — works correctly when called as
 * $meta.checkpoint?.('name', data) with optional chaining.
 */
const checkpoint: CheckpointFn = function (this: IMeta, name: string, data?: unknown): void {
    (this.checkpoints ??= []).push({
        name,
        data,
        timestamp: Date.now(),
    });
    // The same moment is announced to the log, so a checkpoint reaches the record the
    // sequence diagram is drawn from rather than only the list a test asserts on. The
    // vocabulary degrades to nothing where no emitter is attached, so this is one call
    // and never a way for a dispatch path to import the emitter's ambient scope (F-197).
    vocabulary.point(name, data);
};

/**
 * Takes a branch, and keeps the rationale on the invocation that took it (PRD R11/R26).
 *
 * `this`-bound like {@link checkpoint}. The branch's `run` is *wrapped* rather than the
 * predicates re-evaluated: a predicate with a side effect must run exactly once, and the
 * decision recorded has to be the one the code actually took. A branch whose `run` throws
 * records nothing — the throw propagates before the push, because a decision that never
 * completed is not a decision.
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
    const result = vocabulary.decide<T>(discriminator, values, wrapped);
    (this.decisions ??= []).push({
        discriminator,
        candidates: branches.map(branch => branch.name),
        chosen: chosen ?? 'none',
        values,
    });
    return result;
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
