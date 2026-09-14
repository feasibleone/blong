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

import {decide} from '../src/decide.ts';
import type {Participant} from './participant.ts';

export interface FxpOptions {
    rate?: number;
    rateLimit?: number;
    /** Decline every rate, so the caller can exercise the refusal branch (fault F5). */
    declineAll?: boolean;
}

export function installFxp(participant: Participant, options: FxpOptions = {}): void {
    const rate = options.rate ?? 1.1;
    const rateLimit = options.rateLimit ?? 1.15;

    participant.app.post('/quotes', async (request, reply) => {
        const traceId = participant.traceFrom(request);
        const flowId = participant.flowFrom(request);
        const leg = participant.legFrom(request);
        const result = await participant.run(traceId, flowId, leg, () =>
            participant.phase('quote', async () => {
                const accepted = decide('rate-within-limit', {rate, rateLimit}, [
                    {
                        name: 'decline',
                        when: values =>
                            options.declineAll === true ||
                            (values.rate as number) > (values.rateLimit as number),
                        run: () => false,
                    },
                    {name: 'accept', when: () => true, run: () => true},
                ]);
                if (!accepted) {
                    participant.logger.warn('rate declined', {rate, rateLimit});
                    return {status: 409, body: {reason: 'rate above provider limit'}};
                }
                participant.logger.info('rate published', {rate, condition: 'sha256:condition'});
                return {status: 200, body: {rate, condition: 'sha256:condition'}};
            }),
        );
        reply.status(result.status);
        return result.body;
    });
}
