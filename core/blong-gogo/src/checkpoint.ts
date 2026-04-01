import type { CheckpointFn, IMeta } from '@feasibleone/blong/types';

/**
 * Records a checkpoint in the $meta.checkpoints array.
 * Uses `this` binding — works correctly when called as
 * $meta.checkpoint('name', data) with optional chaining.
 */
const checkpoint: CheckpointFn = function (this: IMeta, name: string, data?: unknown): void {
    (this.checkpoints ??= []).push({
        name,
        data,
        timestamp: Date.now(),
    });
};

/**
 * Attaches the checkpoint function to $meta if not already present.
 * The function uses `this` to record into the $meta it's called on.
 */
export function attachCheckpoint($meta: IMeta): void {
    $meta.checkpoint ??= checkpoint;
}

/**
 * Returns an attachCheckpoint function when checkpoint mode is enabled,
 * or undefined for production (zero overhead via optional chaining).
 */
export function createAttachCheckpoint(
    mode: 'test' | 'debug' | 'production',
): ((meta: IMeta) => void) | undefined {
    return mode === 'production' ? undefined : attachCheckpoint;
}
