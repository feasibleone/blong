/**
 * FX provider.
 *
 * Declines a rate above its own limit and records why — the decision a real
 * provider makes on every request. The branch rationale is recorded whichever
 * way it goes, so F5 can show *which* branch was taken rather than only that
 * the quote failed.
 *
 * The status is set on the reply explicitly; a returned `{status, body}` object
 * would be answered with HTTP 200 by fastify and the decline would never leave
 * this participant (see `payer.ts` for the full note).
 */

import {declare} from '../index.ts';
import {decide} from '../src/decide.ts';
import type {Participant} from './participant.ts';

/**
 * What the provider reports — the decision it made, in both directions.
 *
 * A provider's whole contribution is one branch, so the two names are a pair: `rateDeclined` and
 * `ratePublished` say which arm of `rate-within-limit` ran, and the diagram draws them inside the
 * `alt` block because that is where they are emitted (`@@D-889`).
 */
export const fxpVocabulary = declare({
    log: {
        /** The rate was above what this provider will quote. */
        fxpRateDeclined: {level: 'warn', message: 'rate declined: {rate} above {rateLimit}'},
        /** The rate was published with its condition. */
        fxpRatePublished: {level: 'info', message: 'rate published at {rate}'},
    },
    decision: {
        rateWithinLimit: {
            message: 'whether a provider quotes the rate it was asked for',
            branch: {
                decline: 'the rate is above this provider limit',
                accept: 'the rate is quotable',
            },
        },
    },
});

export interface FxpOptions {
    rate?: number;
    rateLimit?: number;
    /** Decline every rate, so the caller can exercise the refusal branch (fault F5). */
    declineAll?: boolean;
}

export function installFxp(participant: Participant, options: FxpOptions = {}): void {
    const {signal} = participant;
    const rate = options.rate ?? 1.1;
    const rateLimit = options.rateLimit ?? 1.15;

    participant.app.post('/quotes', async (request, reply) => {
        const traceId = participant.traceFrom(request);
        const flowId = participant.flowFrom(request);
        const leg = participant.legFrom(request);
        const result = await participant.run(traceId, flowId, leg, () =>
            participant.phase('quote', async () => {
                const accepted = decide(
                    fxpVocabulary.decision.rateWithinLimit,
                    {rate, rateLimit},
                    [
                    {
                        name: 'decline',
                        when: values =>
                            options.declineAll === true ||
                            (values.rate as number) > (values.rateLimit as number),
                        run: () => {
                            // Emitted *inside* the branch, which is what puts it inside the
                            // `alt` block the diagram draws (PRD R26/R27): a record written
                            // after `decide` returns is outside every branch, however much it
                            // is about the decision.
                            signal?.fxpRateDeclined?.({rate, rateLimit});
                            return false;
                        },
                    },
                    {
                        name: 'accept',
                        when: () => true,
                        run: () => {
                            signal?.fxpRatePublished?.({rate});
                            return true;
                        },
                    },
                ]);
                if (!accepted) {
                    return {status: 409, body: {reason: 'rate above provider limit'}};
                }
                return {status: 200, body: {rate, condition: 'sha256:condition'}};
            }),
        );
        reply.status(result.status);
        return result.body;
    });
}
