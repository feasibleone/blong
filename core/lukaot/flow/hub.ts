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

import {declare} from '../index.ts';
import {bindLeg} from '../src/context.ts';
import {hop, type Participant} from './participant.ts';

/**
 * What a switch reports — a receipt for every call it is handed, and its own calls in between.
 *
 * The receipts are what make a hop an *edge*: a call whose far end says nothing is an arrow nobody can
 * see, so `hubPartyLookupReceived` and its siblings exist as names rather than as prose in a line of
 * each route handler (`@@D-889`). The four `withhold` calls stay as they are — they are not records,
 * they are detail held back until a failure escalates it — which is why the vocabulary below has no
 * entry for routing or liquidity.
 *
 * One name is missing that a reader of the old fixture expects: the reworded liquidity message. A
 * message is a *declaration* now, so "a deploy reworded it" is an edit to this file rather than
 * something a fault option can do to a call site (`@@D-912` supersedes the fault).
 */
export const hubVocabulary = declare({
    log: {
        /** The payer's party lookup arrived. */
        hubPartyLookupReceived: {level: 'info', message: 'party lookup received'},
        /** The lookup was forwarded to the payee's scheme. */
        hubPartyLookupForwarded: {level: 'info', message: 'party lookup forwarded to {target}'},
        /** A quote request arrived. */
        hubQuoteRequestReceived: {
            level: 'info',
            message: 'quote request received: {amount} {from} to {to}',
        },
        /** The corridor's provider was asked for a rate. */
        hubRateRequested: {level: 'info', message: 'fx rate requested from {from} to {to}'},
        /** The provider refused the rate. */
        hubQuoteDeclined: {
            level: 'error',
            message: 'provider declined the quote: {reason}',
        },
        /** The payee's scheme was asked to sign the quote. */
        hubPayeeQuoteRequested: {level: 'info', message: 'payee quote requested for {amount}'},
        /** The quote was assembled from both halves. */
        hubQuoteAssembled: {level: 'info', message: 'quote assembled at {rate}'},
        /** A transfer arrived and preparation started. */
        hubTransferPrepareStarted: {
            level: 'info',
            message: 'transfer prepare started for {amount}',
        },
        /** Liquidity for the transfer was reserved locally. */
        hubLiquidityReserved: {
            level: 'info',
            message: 'liquidity reserved: {amount} {currency}',
        },
        /** The settlement was delivered to the payee's scheme. */
        hubSettlementDeliveryRequested: {
            level: 'info',
            message: 'settlement delivery requested for {amount} {currency}',
        },
        /** The payee's scheme refused the settlement. */
        hubSettlementFailed: {level: 'error', message: 'settlement failed: {reason}'},
        /** The settlement committed. */
        hubSettlementCommitted: {
            level: 'info',
            message: 'settlement committed in {elapsedMs}ms',
        },
    },
});

export interface HubOptions {
    fxpUrl: string;
    payeeUrl: string;
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
    const {signal} = participant;

    app.post('/parties', async (request, reply) => {
        const traceId = participant.traceFrom(request);
        const flowId = participant.flowFrom(request);
        // The leg the caller declared for this call. Binding it for the whole
        // request is what makes the two ends of one hop name the same call: the
        // receipt below carries the caller's id, and everything the hub does for
        // that call carries it until the hub makes a call of its own (PRD R22).
        const leg = participant.legFrom(request);
        const result = await participant.run(traceId, flowId, leg, () =>
            participant.phase('discovery', async () => {
                // Every route logs a receipt, and this is the one that carries the
                // *inbound* leg — without it the payer's leg would be observed at one
                // end only, and a call with one end is not an edge.
                // The receipt, before the call it is a receipt for: this is the far end of the
                // payer's lookup, and a call is an edge only when both ends name it.
                signal?.hubPartyLookupReceived?.({});
                const forwarded = await bindLeg(
                    {...HUB_CALLS.discoveryPayee, from: caller},
                    async () => {
                        signal?.hubPartyLookupForwarded?.({target: 'payee'});
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
        const result = await participant.run(traceId, flowId, leg, () =>
            participant.phase('quote', async () => {
                const body = (request.body ?? {}) as {amount?: number; from?: string; to?: string};
                signal?.hubQuoteRequestReceived?.({
                    amount: body.amount,
                    from: body.from,
                    to: body.to,
                });
                // Each hop logs the request inside its own leg and the receipt outside it,
                // which is the instrumentation rule the observed topology rests on: a call
                // is an edge only when both ends name it (PRD R22).
                const fx = await bindLeg({...HUB_CALLS.quoteFx, from: caller}, async () => {
                    signal?.hubRateRequested?.({from: body.from, to: body.to});
                    return hop(participant, options.fxpUrl, '/quotes', body);
                });
                if (fx.status >= 400) {
                    signal?.hubQuoteDeclined?.({reason: `fxp returned ${fx.status}`});
                    return {status: fx.status, body: fx.body};
                }
                const payee = await bindLeg({...HUB_CALLS.quotePayee, from: caller}, async () => {
                    signal?.hubPayeeQuoteRequested?.({amount: body.amount});
                    return hop(participant, options.payeeUrl, '/quotes', fx.body);
                });
                const rate = (fx.body as {rate?: number} | undefined)?.rate ?? 1;
                signal?.hubQuoteAssembled?.({rate});
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
        const result = await participant.run(traceId, flowId, leg, () =>
            participant.phase('transfer', async () => {
                const body = (request.body ?? {}) as {amount?: number; currency?: string};
                signal?.hubTransferPrepareStarted?.({amount: body.amount});

                // Detail a real hub holds but does not transmit. It rides the caller's
                // leg, because it is detail *about that call* that the caller never saw.
                participant.logger.withhold({routing: {fxp: 'fxp-primary', decidedBy: 'rate'}});
                participant.logger.withhold({liquidity: {reserved: body.amount, currency: body.currency}});

                signal?.hubLiquidityReserved?.({amount: body.amount, currency: body.currency});

                const started = Date.now();
                const payee = await bindLeg(
                    {...HUB_CALLS.transferDeliver, from: caller},
                    async () => {
                        signal?.hubSettlementDeliveryRequested?.({
                            amount: body.amount,
                            currency: body.currency,
                        });
                        return hop(participant, options.payeeUrl, '/transfers', body);
                    },
                );
                if (payee.status >= 400) {
                    const reason =
                        (payee.body as {reason?: string} | undefined)?.reason ?? 'unknown';
                    participant.logger.withhold({settlement: {attempted: body.amount, payeeResponse: reason}});
                    signal?.hubSettlementFailed?.({reason: `payee refused: ${reason}`});
                    return {status: 502, body: {reason}};
                }
                signal?.hubSettlementCommitted?.({elapsedMs: Date.now() - started});
                return {status: 200, body: {status: 'settled'}};
            }),
        );
        reply.status(result.status);
        return result.body;
    });
}
