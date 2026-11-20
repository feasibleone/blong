/**
 * What the chain executor reports, declared where the executor is.
 *
 * The executor is a library with an injected logger, not a component on a port: a test run constructs
 * it inside a controller, a demo does the same, and none of them is a realm. So its names are declared
 * here and turned into a callable surface over **its own** logger — the same `signalView` the flow
 * fixtures use — rather than contributed to whatever port happens to be in the process (`@@D-918`).
 *
 * Two names, because the two moments are different questions. A retry is work continuing after a
 * failure, and a reader watching a slow run wants its count; a failed step is the run stopping, and
 * that is the record with the error on it.
 */

import {declare} from '@feasibleone/lukaot';

export const chainVocabulary = declare({
    log: {
        /** A step failed and the executor is about to try it again. */
        chainStepRetried: {
            level: 'warn',
            message: 'step {step} failed (attempt {attempt} of {attempts}), retrying: {reason}',
        },
        /** A step failed with no attempt left, so the run stops there. */
        chainStepFailed: {
            level: 'error',
            message: 'step {step} failed: {reason}',
        },
    },
});
