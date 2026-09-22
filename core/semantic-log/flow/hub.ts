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

import {bindLeg} from '../src/context.ts';
import type {Logger} from '../src/logger.ts';
import {hop, type Participant} from './participant.ts';

export interface HubOptions {
    fxpUrl: string;
    payeeUrl: string;
    /** Reword a message as if a deploy had changed it (fault F3). */
    rewordLiquidity?: boolean;
}

/** One call this hub makes: the method it calls, and the unit it expects to answer. */
interface HubCall {
    readonly id: string;
    readonly to: string;
}

/**
 * The calls a hub makes, declared as literals.
 *
 * The label on an arrow is the **method** the call reaches its callee with, and the unit that
 * made the call is stated beside it (`from`) rather than repeated inside the label — so one
 * set of methods serves every mount: the receiving scheme's hub calls `discovery.payee`
 * exactly as the first one does, and the two arrows differ by their source, which is what they
 * always meant. Declared as literals in one place so the label on a diagram stays greppable in
 * the file that declares it (the parity check in `test/flow/observedFlows.test.ts` reads them
 * from here). The `to` of each is the unit the caller expects to answer, which is what makes
 * an edge known from one observation.
 */
const HUB_CALLS: Record<string, HubCall> = {
    discoveryPayee: {id: 'discovery.payee', to: 'payee'},
    quoteFx: {id: 'quote.fx', to: 'fxp'},
    quotePayee: {id: 'quote.payee', to: 'payee'},
    transferDeliver: {id: 'transfer.deliver', to: 'payee'},
};

export function installHub(participant: Participant, options: HubOptions): void {
    const {app} = participant;
    // The unit this hub runs as: the caller every leg it declares is made by. Read once,
    // because a mount's name is the source of its arrows — the labels no longer carry it, so
    // this is the only place it is said.
    const caller = participant.name;
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
        // The leg the caller declared for this call. Binding it for the whole
        // request is what makes the two ends of one hop name the same call: the
        // receipt below carries the caller's id, and everything the hub does for
        // that call carries it until the hub makes a call of its own (PRD R22).
        const leg = participant.legFrom(request);
        const logger = stepLogger();
        const result = await participant.run(traceId, flowId, leg, () =>
            participant.phase('discovery', async () => {
                // Every route logs a receipt, and this is the one that carries the
                // *inbound* leg — without it the payer's leg would be observed at one
                // end only, and a call with one end is not an edge.
                logger.info('party lookup received', {
                    req: {operation: 'POST', target: '/parties'},
                });
                const forwarded = await bindLeg(
                    {...HUB_CALLS.discoveryPayee, from: caller},
                    async () => {
                        logger.info('party lookup forwarded', {
                            req: {operation: 'POST', target: '/parties'},
                        });
                        return hop(participant, options.payeeUrl, '/parties', request.body);
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
                logger.info('quote request received', {
                    amount: body.amount,
                    from: body.from,
                    to: body.to,
                });
                // Each hop logs the request inside its own leg and the receipt outside it,
                // which is the instrumentation rule the observed topology rests on: a call
                // is an edge only when both ends name it (PRD R22).
                const fx = await bindLeg({...HUB_CALLS.quoteFx, from: caller}, async () => {
                    logger.info('fx rate requested', {from: body.from, to: body.to});
                    return hop(participant, options.fxpUrl, '/quotes', body);
                });
                if (fx.status >= 400) {
                    logger.error('provider declined the quote', {
                        err: {message: `fxp returned ${fx.status}`},
                        res: {status: fx.status},
                    });
                    return {status: fx.status, body: fx.body};
                }
                const payee = await bindLeg({...HUB_CALLS.quotePayee, from: caller}, async () => {
                    logger.info('payee quote requested', {amount: body.amount});
                    return hop(participant, options.payeeUrl, '/quotes', fx.body);
                });
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
        const leg = participant.legFrom(request);
        const logger = stepLogger();
        const result = await participant.run(traceId, flowId, leg, () =>
            participant.phase('transfer', async () => {
                const body = (request.body ?? {}) as {amount?: number; currency?: string};
                logger.info('transfer prepare started', {amount: body.amount});

                // Detail a real hub holds but does not transmit. It rides the caller's
                // leg, because it is detail *about that call* that the caller never saw.
                logger.withhold({routing: {fxp: 'fxp-primary', decidedBy: 'rate'}});
                logger.withhold({liquidity: {reserved: body.amount, currency: body.currency}});

                logger.info(liquidityMessage(), {amount: body.amount, currency: body.currency});

                const started = Date.now();
                const payee = await bindLeg(
                    {...HUB_CALLS.transferDeliver, from: caller},
                    async () => {
                        logger.info('settlement delivery requested', {
                            amount: body.amount,
                            currency: body.currency,
                        });
                        return hop(participant, options.payeeUrl, '/transfers', body);
                    },
                );
                if (payee.status >= 400) {
                    const reason =
                        (payee.body as {reason?: string} | undefined)?.reason ?? 'unknown';
                    logger.withhold({settlement: {attempted: body.amount, payeeResponse: reason}});
                    logger.error('settlement failed', {
                        err: {message: `payee refused: ${reason}`},
                        res: {status: payee.status, elapsedMs: Date.now() - started},
                    });
                    return {status: 502, body: {reason}};
                }
                logger.info('settlement committed', {
                    res: {status: payee.status, elapsedMs: Date.now() - started},
                });
                return {status: 200, body: {status: 'settled'}};
            }),
        );
        reply.status(result.status);
        return result.body;
    });
}
