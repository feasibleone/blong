/**
 * The hypothesis a failure gets, and the numbers it rests on.
 *
 * A verdict exists to stop a reader drawing the wrong conclusion from a correct one. In build
 * #622 both tap failures were *timeouts on a runner that was two to three times slower than the
 * previous run*, which reads as "the tests hang" unless something says otherwise; the third was a
 * Storybook image snapshot that only differed because the story streams on a timer. None of the
 * three was a broken test, and the evidence that says so — the previous run's own verdict on the
 * same package, the budget that expired, the leg that published nothing — is what this module
 * turns into one line.
 *
 * The line is phrased as what the numbers show, never as a diagnosis of the code: `unknown` is
 * returned rather than a guess when nothing supports a cause (@@D-561).
 */

import {formatDurationMs} from '../report/reportTypes.ts';
import type {ICiFailure, IRunComparison, IVerdict} from './types.ts';

/** Words that mean a budget ran out, in tap's own vocabulary and in the report's. */
const TIMEOUT = /timeout|expired|budget/i;

/**
 * The structural marks of an expiry in a raw stream.
 *
 * Matched as structure rather than as the word: tap's handle dump lists `timeout` among a socket's
 * events, so a text search would call every failure on a socket a timeout. The `timeout!` case and
 * the `expired:` name are what actually mean it.
 */
const EXPIRED_IN_STREAM = /not ok \d+ - timeout!|^\s*expired: /m;

/**
 * An image snapshot comparison, as jest's `jest-image-snapshot` words it.
 *
 * A committed image being different is not an assertion failing: the runner compared two frames
 * within a tolerance. The percentage and the pixel count are in the message, and on a slow runner
 * they move for reasons the code did not — a story that streams on a timer, a date, a hostname
 * (@@F-542).
 */
const SNAPSHOT_DIFF = /(\d+(?:\.\d+)?)% different from snapshot \((\d+) differing pixels?\)/;

/** The verdict for a failing test, when the evidence supports one. */
export function verdictFor(
    failure: Pick<ICiFailure, 'test' | 'message' | 'evidence' | 'history'>,
    previous: IRunComparison | undefined,
): IVerdict | undefined {
    const timedOut =
        TIMEOUT.test(failure.message ?? '') ||
        TIMEOUT.test(failure.test) ||
        EXPIRED_IN_STREAM.test(failure.evidence ?? '');
    if (timedOut) {
        if (previous && previous.status === 'passed') {
            return {
                kind: 'timeout-under-load',
                reason:
                    `the package passed in #${previous.run} ` +
                    `(${formatDurationMs(previous.testsMs)} of tests) and its budget expired here, ` +
                    'so the runner was slower rather than the code broken',
            };
        }
        if (previous) {
            return {
                kind: 'timeout-under-load',
                reason:
                    `a budget expired while the package was already ${previous.status} ` +
                    `in #${previous.run}`,
            };
        }
        return {
            kind: 'timeout-under-load',
            reason: 'a budget expired; no earlier run of this package was published to compare against',
        };
    }
    const snapshot = SNAPSHOT_DIFF.exec(`${failure.message ?? ''}\n${failure.evidence ?? ''}`);
    if (snapshot) {
        return {
            kind: 'snapshot-mismatch',
            reason:
                `the rendered frame differs from the committed image by ${snapshot[1]}% ` +
                `(${snapshot[2]} differing pixels), which is a tolerance comparison rather than a ` +
                'failed assertion — the diff image beside the snapshot is what decides whether ' +
                'the change was intended',
        };
    }
    if (failure.history?.kind === 'new') {
        return {kind: 'new-failure', reason: 'the base branch was green on this test'};
    }
    if (failure.history?.kind === 'recurring') {
        return {kind: 'recurring', reason: 'the base branch is already red on this test'};
    }
    return undefined;
}

/**
 * The verdict for a package whose operation failed without the bundle hearing about it.
 *
 * This is the gap build #622 had: the `blong-log` operation exited 1 because its Storybook leg
 * failed an image snapshot, while the package's report — written by the tap leg — read as passed,
 * so the bundle published two failures for a run that had three (@@F-539).
 */
export function legGapVerdict(operation: {package: string; detail: readonly string[]}): IVerdict {
    const detail = operation.detail.find(line => line.startsWith('#')) ?? '';
    return {
        kind: 'leg-gap',
        reason:
            `the run's summary calls ${operation.package}'s operation failed while the failures ` +
            'bundle has nothing for it, which is what a leg that publishes no report looks like' +
            (detail === '' ? '' : ` (${detail.replace(/^#\s*/, '')})`),
    };
}
