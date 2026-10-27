import {timingSafeEqual} from 'node:crypto';

import {handler, type IMeta} from '@feasibleone/blong';

import type {IReleaseNotify} from './kustomizeReleaseNotify.ts';

/** The announcement a release makes, plus the token that permits it. */
export interface IReleaseApprove extends IReleaseNotify {
    token: string;
}

type NotifyCall = (params: IReleaseNotify, $meta: IMeta) => Promise<unknown>;

/** The refusals the gate can raise, injected so the decision is testable without a handler. */
export interface IApproveErrors {
    tokenMissing: () => Error;
    tokenMismatch: () => Error;
    malformed: (reason: string) => Error;
}

/**
 * Compare two tokens without leaking their first difference in the time it takes.
 *
 * A length check first, because `timingSafeEqual` refuses different lengths; the length is not a
 * secret, and a mismatch past it is still one comparison.
 */
export const tokensMatch = (supplied: string, expected: string): boolean => {
    const left = Buffer.from(supplied);
    const right = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(left, right);
};

/**
 * The release gate, as a decision: token, then shape, then the call.
 *
 * Exported rather than kept in the handler because the interesting order is what a test has to
 * hold: a wrong token must be refused *before* anything is written, and a valid one must reach the
 * notify handler with the release fields unchanged and the secret spent.
 */
export const approveRelease = async (
    params: IReleaseApprove,
    expectedToken: string | undefined,
    notify: NotifyCall,
    $meta: IMeta,
    errors: IApproveErrors,
): Promise<unknown> => {
    if (!expectedToken) throw errors.tokenMissing();
    if (!params?.token || !tokensMatch(params.token, expectedToken)) {
        throw errors.tokenMismatch();
    }
    if (!params.suite || !params.version) {
        throw errors.malformed('suite and version are required');
    }
    const {token: _, ...release} = params;
    return notify(release, $meta);
};

/**
 * kustomize.release.approve — the token-gated release trigger (@@D-639).
 *
 * The operator is the only writer of Deployments, and its gateway is reachable from outside the
 * cluster so a release workflow can announce itself. The token is the whole gate: absent from the
 * operator's environment is a refusal, not a fallback, so a misconfigured operator is closed rather
 * than open. The cluster call happens only after both checks, which is what lets a wrong token be
 * asserted without a cluster in the loop.
 */
export default handler(
    ({
        handler,
        errors: {
            errorKustomizeReleaseTokenMissing,
            errorKustomizeReleaseTokenMismatch,
            errorKustomizeReleaseMalformed,
        },
    }) => ({
        async kustomizeReleaseApprove(
            params: IReleaseApprove,
            $meta?: IMeta,
        ): Promise<unknown> {
            const notify = (handler as Record<string, unknown>)['kustomizeReleaseNotify'] as
                | NotifyCall
                | undefined;
            if (!notify) {
                throw errorKustomizeReleaseMalformed({
                    params: {reason: 'the release handler is not loaded'},
                });
            }
            // The token is spent in `approveRelease`: the notify handler's contract is the release,
            // and passing the secret on would put it in every answer and every log the call touches.
            return approveRelease(
                params,
                process.env['BLONG_RELEASE_TOKEN'],
                notify,
                $meta as IMeta,
                {
                    tokenMissing: () => errorKustomizeReleaseTokenMissing(),
                    tokenMismatch: () => errorKustomizeReleaseTokenMismatch(),
                    malformed: reason => errorKustomizeReleaseMalformed({params: {reason}}),
                },
            );
        },
    }),
);
