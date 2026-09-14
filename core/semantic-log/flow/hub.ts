/**
 * Hub — the switch.
 *
 * The interesting behaviour here is withholding: routing and liquidity detail
 * is retained locally and only flushed if the settlement fails. A real hub has
 * exactly this detail and exactly this reason not to ship it on the happy path.
 *
 * The hub is also where a provider's refusal has to stop the chain. Answering a
 * payer with a synthesised rate after the provider declined would make the
 * decline invisible end to end, and F5 exists precisely to make that branch
 * observable, so `/quotes` carries the provider's status back rather than
 * papering over it.
 *
 * As in every participant, a route computes a `{status, body}` result and maps
 * it onto the reply explicitly; returning that object from a fastify handler
 * would answer HTTP 200 with the envelope as the body, so the next hop could
 * never see a failure (see `payer.ts` for the full note).
 *
 * Every step logs through a **request-scoped child** ({@link stepLogger}). The
 * withheld bag lives on the logger, not on the request, so withholding on the
 * participant's shared logger would hold one execution's routing and liquidity
 * detail until *any* later failure drained it — releasing it onto an unrelated
 * execution's record, under that execution's trace and flow id.
 */

import type {Logger} from '../src/logger.ts';
import {hop, type Participant} from './participant.ts';

export interface HubOptions {
    fxpUrl: string;
    payeeUrl: string;
    /** Reword a message as if a deploy had changed it (fault F3). */
    rewordLiquidity?: boolean;
}

export function installHub(participant: Participant, options: HubOptions): void {
    const {app} = participant;
    /**
     * A **request-scoped** logger for one protocol step.
     *
     * A child gets its own withheld bag and shares the write tracker, so the
     * parent's `flush` still drains it — which is what makes "this request's
     * detail, released by this request's failure" true rather than aspirational.
     */
    const stepLogger = (): Logger => participant.logger.child({});
    const liquidityMessage = (): string =>
        options.rewordLiquidity ? 'liquidity hold placed' : 'liquidity reserved';

    app.post('/parties', async (request, reply) => {
        const traceId = participant.traceFrom(request);
        const flowId = participant.flowFrom(request);
        const logger = stepLogger();
        const result = await participant.run(traceId, flowId, () =>
            participant.phase('discovery', async () => {
                logger.info('party lookup forwarded', {req: {operation: 'POST', target: '/parties'}});
                const forwarded = await hop(participant, options.payeeUrl, '/parties', request.body, traceId, flowId);
                return {status: forwarded.status, body: forwarded.body};
            }),
        );
        reply.status(result.status);
        return result.body;
    });

    app.post('/quotes', async (request, reply) => {
        const traceId = participant.traceFrom(request);
        const flowId = participant.flowFrom(request);
        const logger = stepLogger();
        const result = await participant.run(traceId, flowId, () =>
            participant.phase('quote', async () => {
                const body = (request.body ?? {}) as {amount?: number; from?: string; to?: string};
                logger.info('quote request received', {amount: body.amount, from: body.from, to: body.to});
                const fx = await hop(participant, options.fxpUrl, '/quotes', body, traceId, flowId);
                if (fx.status >= 400) {
                    logger.error('provider declined the quote', {
                        err: {message: `fxp returned ${fx.status}`},
                        res: {status: fx.status},
                    });
                    return {status: fx.status, body: fx.body};
                }
                const payee = await hop(participant, options.payeeUrl, '/quotes', fx.body, traceId, flowId);
                const rate = (fx.body as {rate?: number} | undefined)?.rate ?? 1;
                logger.info('quote assembled', {rate});
                return {status: 200, body: {...(payee.body as object), rate}};
            }),
        );
        reply.status(result.status);
        return result.body;
    });

    app.post('/transfers', async (request, reply) => {
        const traceId = participant.traceFrom(request);
        const flowId = participant.flowFrom(request);
        const logger = stepLogger();
        const result = await participant.run(traceId, flowId, () =>
            participant.phase('transfer', async () => {
                const body = (request.body ?? {}) as {amount?: number; currency?: string};
                logger.info('transfer prepare started', {amount: body.amount});

                // Detail a real hub holds but does not transmit.
                logger.withhold({routing: {fxp: 'fxp-primary', decidedBy: 'rate'}});
                logger.withhold({liquidity: {reserved: body.amount, currency: body.currency}});

                logger.info(liquidityMessage(), {amount: body.amount, currency: body.currency});

                const started = Date.now();
                const payee = await hop(participant, options.payeeUrl, '/transfers', body, traceId, flowId);
                if (payee.status >= 400) {
                    const reason = (payee.body as {reason?: string} | undefined)?.reason ?? 'unknown';
                    logger.withhold({settlement: {attempted: body.amount, payeeResponse: reason}});
                    logger.error('settlement failed', {
                        err: {message: `payee refused: ${reason}`},
                        res: {status: payee.status, elapsedMs: Date.now() - started},
                    });
                    return {status: 502, body: {reason}};
                }
                logger.info('settlement committed', {res: {status: payee.status, elapsedMs: Date.now() - started}});
                return {status: 200, body: {status: 'settled'}};
            }),
        );
        reply.status(result.status);
        return result.body;
    });
}
