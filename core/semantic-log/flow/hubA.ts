/**
 * Hub A — the originating scheme's switch.
 *
 * The interesting behaviour is what it holds that the corridor does not carry.
 * It reserves local liquidity the moment it submits, and that reservation is
 * retained locally and released only if the settlement fails — the same
 * withhold-then-escalate shape as the receiving hub, seen from the side that
 * takes the risk first (PRD R10).
 *
 * It also prices locally before it prices the corridor: the originating scheme's
 * **own** provider (a different participant from the receiving scheme's, so the two
 * quote different numbers) gives an indication, and the cross-scheme quote is what
 * the transfer actually settles on. Both are recorded together, so an operator
 * looking at a disputed rate can see whether the corridor moved or the local
 * indication did. The indication is deliberately **not** a gate — it is
 * reporting, and refusing to cross because a local indication is unavailable
 * would turn a diagnostic detail into a new failure mode. Its status travels in
 * the record instead, so a declined indication is visible without being fatal,
 * and the corridor still decides the outcome.
 *
 * The status is set on the reply explicitly; a returned `{status, body}` object
 * would be answered with HTTP 200 by fastify, so a cross-border failure would
 * never reach the payer and R15's origin would be lost (see `payer.ts` for the
 * full note).
 */

import {bindLeg} from '../src/context.ts';
import type {Logger} from '../src/logger.ts';
import {hop, type Participant} from './participant.ts';

export interface HubAOptions {
    proxyUrl: string;
    /** The originating scheme's own FX provider, used for the local indication. */
    fxpUrl: string;
}

export function installHubA(participant: Participant, options: HubAOptions): void {
    const {app} = participant;
    /**
     * A **request-scoped** logger for one protocol step, for the same reason as in
     * `hub.ts`: the withheld bag lives on the logger, so a shared one would let one
     * execution's liquidity reservation ride another execution's failure.
     */
    const stepLogger = (): Logger => participant.logger.child({});

    app.post('/parties', async (request, reply) => {
        const traceId = participant.traceFrom(request);
        const flowId = participant.flowFrom(request);
        const leg = participant.legFrom(request);
        const logger = stepLogger();
        const result = await participant.run(traceId, flowId, leg, () =>
            participant.phase('discovery', async () => {
                // The receipt carries the caller's leg: a call is an edge only when
                // both ends of it are observed, and this is the far end of the
                // payer's `/parties` call (PRD R22).
                logger.info('party lookup received', {
                    req: {operation: 'POST', target: '/parties'},
                });
                const forwarded = await bindLeg(
                    {id: 'hubA.discovery.proxy', to: 'proxy'},
                    async () => {
                        // No party directory of its own for the far scheme: everything
                        // crosses. It is the difference from the single-scheme hub that
                        // makes this a separate participant rather than a URL change.
                        logger.info('party lookup routed internationally', {
                            req: {operation: 'POST', target: '/parties'},
                        });
                        return hop(participant, options.proxyUrl, '/parties', request.body);
                    },
                );
                return {status: forwarded.status, body: forwarded.body};
            }),
        );
        reply.status(result.status);
        return result.body;
    });

    app.post('/quotes', async (request, reply) => {
        const traceId = participant.traceFrom(request);
        const flowId = participant.flowFrom(request);
        const leg = participant.legFrom(request);
        const logger = stepLogger();
        const result = await participant.run(traceId, flowId, leg, () =>
            participant.phase('quote', async () => {
                const body = (request.body ?? {}) as {amount?: number; from?: string; to?: string};
                logger.info('cross-scheme quote requested', {
                    amount: body.amount,
                    from: body.from,
                    to: body.to,
                });
                // The origin scheme's own indication, and the corridor's quote, are two
                // separate calls — which is why they are two legs and not one. Folding
                // them together would report a corridor price the far scheme never gave.
                const local = await bindLeg({id: 'hubA.quote.local', to: 'fxpA'}, async () => {
                    logger.info('local indication requested', {from: body.from, to: body.to});
                    return hop(participant, options.fxpUrl, '/quotes', {
                        amount: body.amount,
                        from: body.from,
                        to: body.to,
                    });
                });
                const crossed = await bindLeg({id: 'hubA.quote.proxy', to: 'proxy'}, async () => {
                    logger.info('corridor quote requested', {amount: body.amount});
                    return hop(participant, options.proxyUrl, '/quotes', body);
                });
                logger.info('cross-scheme quote assembled', {
                    res: {status: crossed.status},
                    rate: (crossed.body as {rate?: number} | undefined)?.rate,
                    localRate: (local.body as {rate?: number} | undefined)?.rate,
                    localStatus: local.status,
                });
                return {status: crossed.status, body: crossed.body};
            }),
        );
        reply.status(result.status);
        return result.body;
    });

    app.post('/transfers', async (request, reply) => {
        const traceId = participant.traceFrom(request);
        const flowId = participant.flowFrom(request);
        const leg = participant.legFrom(request);
        const logger = stepLogger();
        const result = await participant.run(traceId, flowId, leg, () =>
            participant.phase('transfer', async () => {
                const body = (request.body ?? {}) as {amount?: number; currency?: string};
                logger.info('local funds blocked', {amount: body.amount, currency: body.currency});
                // Local risk taken before the corridor is asked to settle. Retained
                // here and released only when something fails: on the happy path the
                // reservation never leaves this participant.
                logger.withhold({
                    liquidity: {reserved: body.amount, currency: body.currency, scheme: 'A'},
                });
                const started = Date.now();
                const settled = await bindLeg(
                    {id: 'hubA.transfer.proxy', to: 'proxy'},
                    async () => {
                        logger.info('corridor settlement requested', {
                            amount: body.amount,
                            currency: body.currency,
                        });
                        return hop(participant, options.proxyUrl, '/transfers', body);
                    },
                );
                if (settled.status >= 400) {
                    logger.error('inter-scheme settlement failed', {
                        err: {message: `proxy returned ${settled.status}`},
                        res: {status: settled.status, elapsedMs: Date.now() - started},
                    });
                    return {status: 502, body: settled.body};
                }
                logger.info('inter-scheme settlement committed', {
                    res: {status: settled.status, elapsedMs: Date.now() - started},
                });
                return {status: 200, body: {status: 'settled'}};
            }),
        );
        reply.status(result.status);
        return result.body;
    });
}
