/**
 * Hub A — the originating scheme's switch.
 *
 * The interesting behaviour is what it holds that the corridor does not carry.
 * It reserves local liquidity the moment it submits, and that reservation is
 * retained locally and released only if the settlement fails — the same
 * withhold-then-escalate shape as the receiving hub, seen from the side that
 * takes the risk first (PRD R10).
 *
 * It prices the corridor and nothing else. The originating scheme keeps no FX
 * provider of its own — one provider per corridor, asked by the receiving
 * scheme's hub, which is the shape the reference flow has — so the cross-scheme
 * quote is the only price it records, and a disputed rate traces back to the
 * quote that produced it.
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
                    {id: 'discovery.proxy', from: 'hubA', to: 'proxy'},
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
                // One call, because there is one quote: the corridor's. The originating
                // scheme keeps no provider of its own, so there is no local indication to
                // record beside it — the price the payer settles on is this one.
                const crossed = await bindLeg(
                    {id: 'quote.proxy', from: 'hubA', to: 'proxy'},
                    async () => {
                        logger.info('corridor quote requested', {amount: body.amount});
                        return hop(participant, options.proxyUrl, '/quotes', body);
                    },
                );
                logger.info('cross-scheme quote assembled', {
                    res: {status: crossed.status},
                    rate: (crossed.body as {rate?: number} | undefined)?.rate,
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
                    {id: 'transfer.proxy', from: 'hubA', to: 'proxy'},
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
