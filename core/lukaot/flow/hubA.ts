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

import {declare} from '../index.ts';
import {bindLeg} from '../src/context.ts';
import {hop, type Participant} from './participant.ts';

/**
 * What the originating scheme's switch reports — a receipt, and everything that crossed.
 *
 * `hub.ts` declares the switch that owns a payee and a provider; this one owns neither, and the names
 * say so: `hubACrossSchemeQuoteRequested` beside `hubAQuoteRouted`, `hubALocalFundsBlocked` before the
 * corridor is asked to settle. It is the same three steps and a different vocabulary, which is why the
 * two hubs are two declarations and not one with a flag (`@@D-889`).
 */
export const hubAVocabulary = declare({
    log: {
        /** The payer's party lookup arrived. */
        hubAPartyLookupReceived: {level: 'info', message: 'party lookup received'},
        /** The lookup crossed to the corridor's proxy — this scheme has no directory of its own. */
        hubAPartyLookupRouted: {level: 'info', message: 'party lookup routed to {target}'},
        /** A cross-scheme quote was asked for. */
        hubACrossSchemeQuoteRequested: {
            level: 'info',
            message: 'cross-scheme quote requested: {amount} {from} to {to}',
        },
        /** The quote was asked of the corridor. */
        hubACorridorQuoteRequested: {level: 'info', message: 'corridor quote requested for {amount}'},
        /** The corridor's answer was assembled. */
        hubACrossSchemeQuoteAssembled: {
            level: 'info',
            message: 'cross-scheme quote assembled at {rate}',
        },
        /** Local funds were blocked before the corridor was asked to settle. */
        hubALocalFundsBlocked: {
            level: 'info',
            message: 'local funds blocked: {amount} {currency}',
        },
        /** The corridor was asked to settle. */
        hubACorridorSettlementRequested: {
            level: 'info',
            message: 'corridor settlement requested for {amount} {currency}',
        },
        /** The corridor's settlement failed. */
        hubAInterSchemeSettlementFailed: {
            level: 'error',
            message: 'inter-scheme settlement failed: {reason}',
        },
        /** The corridor's settlement committed. */
        hubAInterSchemeSettlementCommitted: {
            level: 'info',
            message: 'inter-scheme settlement committed in {elapsedMs}ms',
        },
    },
});

export interface HubAOptions {
    proxyUrl: string;
}

export function installHubA(participant: Participant, options: HubAOptions): void {
    const {app, signal} = participant;

    app.post('/parties', async (request, reply) => {
        const traceId = participant.traceFrom(request);
        const flowId = participant.flowFrom(request);
        const leg = participant.legFrom(request);
        const result = await participant.run(traceId, flowId, leg, () =>
            participant.phase('discovery', async () => {
                // The receipt carries the caller's leg: a call is an edge only when
                // both ends of it are observed, and this is the far end of the
                // payer's `/parties` call (PRD R22).
                signal?.hubAPartyLookupReceived?.({});
                const forwarded = await bindLeg(
                    {id: 'discovery.proxy', from: 'hubA', to: 'proxy'},
                    async () => {
                        // No party directory of its own for the far scheme: everything
                        // crosses. It is the difference from the single-scheme hub that
                        // makes this a separate participant rather than a URL change.
                        signal?.hubAPartyLookupRouted?.({target: 'proxy'});
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
        const result = await participant.run(traceId, flowId, leg, () =>
            participant.phase('quote', async () => {
                const body = (request.body ?? {}) as {amount?: number; from?: string; to?: string};
                signal?.hubACrossSchemeQuoteRequested?.({
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
                        signal?.hubACorridorQuoteRequested?.({amount: body.amount});
                        return hop(participant, options.proxyUrl, '/quotes', body);
                    },
                );
                signal?.hubACrossSchemeQuoteAssembled?.({
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
        const result = await participant.run(traceId, flowId, leg, () =>
            participant.phase('transfer', async () => {
                const body = (request.body ?? {}) as {amount?: number; currency?: string};
                signal?.hubALocalFundsBlocked?.({amount: body.amount, currency: body.currency});
                // Local risk taken before the corridor is asked to settle. Retained
                // here and released only when something fails: on the happy path the
                // reservation never leaves this participant.
                participant.logger.withhold({
                    liquidity: {reserved: body.amount, currency: body.currency, scheme: 'A'},
                });
                const started = Date.now();
                const settled = await bindLeg(
                    {id: 'transfer.proxy', from: 'hubA', to: 'proxy'},
                    async () => {
                        signal?.hubACorridorSettlementRequested?.({
                            amount: body.amount,
                            currency: body.currency,
                        });
                        return hop(participant, options.proxyUrl, '/transfers', body);
                    },
                );
                if (settled.status >= 400) {
                    signal?.hubAInterSchemeSettlementFailed?.({
                        reason: `proxy returned ${settled.status}`,
                    });
                    return {status: 502, body: settled.body};
                }
                signal?.hubAInterSchemeSettlementCommitted?.({elapsedMs: Date.now() - started});
                return {status: 200, body: {status: 'settled'}};
            }),
        );
        reply.status(result.status);
        return result.body;
    });
}
