/**
 * Payer DFSP — the entry participant.
 *
 * It sets the business intent once, drives discovery → quote → transfer, and
 * branches on the quote a real payer would branch on.
 *
 * Being the flow's **entry point**, this participant is where both identities
 * originate when a request carries none: `traceFrom` mints the causal trace and
 * `flowFrom` mints the execution ULID (PRD R9). Every later participant reads
 * the same two values back off the request and forwards them unchanged, so one
 * execution stays one flow id and one trace however many services it crosses.
 * The flow **kind** is deliberately not minted here: it is the deployment's
 * stable process name, bound once per participant by `flows.ts`.
 *
 * A route computes a `{status, body}` result — the same shape `hop` returns —
 * and the handler maps it onto the reply. It cannot simply *return* that object:
 * fastify answers a returned object with HTTP 200 and the wrapper as the body,
 * so a downstream hop would observe a success and unwrap the envelope instead of
 * the payload. That is why every route here sets the status explicitly.
 */

import {declare} from '../index.ts';
import {bindLeg} from '../src/context.ts';
import {decide} from '../src/decide.ts';
import {hop, type Participant} from './participant.ts';

/**
 * What the payer reports — its own declarations, in its own file.
 *
 * A payer's job in this fixture is to drive a transfer and to say what it learned: what it looked up,
 * what it was quoted, and whether the transfer it submitted settled. Those are names rather than
 * sentences at the call site, so a reader of the artifact — or of a log — can grep one and find both
 * the declaration and every place it is reached (`@@D-889`).
 *
 * The two failures are separate names and not one "did not settle", because they are the two things a
 * person looks for: a quote refused for its rate is a decision this payer made, and a transfer rejected
 * upstream is the switch's.
 */
export const payerVocabulary = declare({
    log: {
        /** The payee's profile was asked for. */
        payerPayeeLookupRequested: {
            level: 'info',
            message: 'looking up payee for {amount} {currency}',
        },
        /** The payee's profile answered. */
        payerPayeeFound: {level: 'info', message: 'payee found: {payeeCurrency}'},
        /** The switch was asked for a rate. */
        payerQuoteRequested: {
            level: 'info',
            message: 'requesting an fx quote from {from} to {to}',
        },
        /** The quote was outside what this payer will pay. */
        payerQuoteRefused: {level: 'warn', message: 'quote refused: {reason} at {rate}'},
        /** The quote was accepted, so the transfer is submitted. */
        payerQuoteAccepted: {level: 'info', message: 'quote accepted at {rate}'},
        /** The transfer was submitted to the switch. */
        payerTransferSubmitted: {level: 'info', message: 'submitting a transfer of {amount}'},
        /** The switch refused the transfer, or answered with a failure. */
        payerTransferRejected: {level: 'error', message: 'transfer rejected: {reason}'},
        /** The switch settled the transfer. */
        payerTransferComplete: {level: 'info', message: 'transfer complete in {elapsedMs}ms'},
    },
    decision: {
        quoteAcceptable: {
            message: 'whether a payer accepts the rate it was quoted',
            branch: {
                reject: 'the rate is above what this payer will pay, or no rate arrived',
                accept: 'the rate is within limit and the quote answered',
            },
        },
    },
});

export interface PayerOptions {
    hubUrl: string;
    /**
     * The name the receiving hub runs under (PRD R22). A leg declares **who** the
     * caller expects to answer, and that is a deployment fact rather than a literal:
     * the same payer calls `hub` in the single-scheme topology and `hubA` in the
     * inter-scheme one, so a declaration baked into this file would misreport every
     * call it labelled. Required for the same reason the flow kind is: a declared
     * receiver that had to be guessed would be a fabricated identity.
     */
    hubName: string;
    /** FX rate above which a real payer would refuse the quote. */
    rateLimit?: number;
}

export function installPayer(participant: Participant, options: PayerOptions): void {
    const {signal, app} = participant;
    const rateLimit = options.rateLimit ?? 1.25;

    app.post('/transfer', async (request, reply) => {
        const traceId = participant.traceFrom(request);
        // The execution id read off the inbound request, not a fresh one: one
        // execution is one ULID however many participants it crosses, so minting
        // here would put two flow ids into the same execution's records (D1,
        // ruled 2026-09-13). `flowFrom` mints only when the request carries none,
        // which is the entry point's job and nobody else's. Being the entry point,
        // the payer is also the one participant with no inbound leg: it *declares*
        // the legs it calls instead of adopting one.
        const flowId = participant.flowFrom(request);
        const leg = participant.legFrom(request);
        const body = (request.body ?? {}) as {amount?: number; currency?: string; target?: string};
        const amount = body.amount ?? 100;
        const currency = body.currency ?? 'USD';

        const result = await participant.run(traceId, flowId, leg, () =>
            participant.phase('discovery', async () => {
                // The leg covers this call's own records too — the request it sends
                // and the answer it reads back — not just the hop in the middle. A
                // reader following `leg=discovery.parties` therefore lands on
                // the call, not on one arbitrary line of it (PRD R22).
                await bindLeg(
                    {id: 'discovery.parties', from: 'payer', to: options.hubName},
                    async () => {
                        signal?.payerPayeeLookupRequested?.({amount, currency});
                        await hop(participant, options.hubUrl, '/parties', {
                            target: body.target ?? 'msisdn-1',
                        });
                        signal?.payerPayeeFound?.({payeeCurrency: 'EUR'});
                    },
                );
                return participant.phase('quote', async () => {
                    const quote = await bindLeg(
                        {id: 'quote.rates', from: 'payer', to: options.hubName},
                        async () => {
                            signal?.payerQuoteRequested?.({from: currency, to: 'EUR'});
                            return hop(participant, options.hubUrl, '/quotes', {
                                amount,
                                from: currency,
                                to: 'EUR',
                            });
                        },
                    );
                    const rate = (quote.body as {rate?: number} | undefined)?.rate ?? 1;
                    // The provider's status is part of the decision's input, not a
                    // separate branch: a decline is exactly the case where no rate
                    // arrived, and folding it in keeps this the one place the payer's
                    // rationale is recorded. Without it the `?? 1` fallback above
                    // would read a decline as a rate of 1 and the transfer would
                    // settle on a quote nobody offered.
                    const accepted = decide(
                        payerVocabulary.decision.quoteAcceptable,
                        {rate, rateLimit, status: quote.status},
                        [
                            {
                                name: 'reject',
                                when: values =>
                                    (values.rate as number) > (values.rateLimit as number) ||
                                    (values.status as number) >= 400,
                                run: () => false,
                            },
                            {name: 'accept', when: () => true, run: () => true},
                        ],
                    );
                    if (!accepted) {
                        signal?.payerQuoteRefused?.({rate, reason: 'rate above limit'});
                        return {status: 409, body: {reason: 'rate above limit'}};
                    }
                    signal?.payerQuoteAccepted?.({rate});
                    return participant.phase('transfer', async () => {
                        const started = Date.now();
                        const settled = await bindLeg(
                            {id: 'transfer.submit', from: 'payer', to: options.hubName},
                            async () => {
                                signal?.payerTransferSubmitted?.({amount});
                                return hop(participant, options.hubUrl, '/transfers', {
                                    amount,
                                    currency,
                                });
                            },
                        );
                        if (settled.status >= 400) {
                            signal?.payerTransferRejected?.({
                                reason: `hub returned ${settled.status}`,
                            });
                            return {status: 502, body: {reason: 'transfer rejected'}};
                        }
                        signal?.payerTransferComplete?.({elapsedMs: Date.now() - started});
                        return {status: 200, body: {status: 'settled'}};
                    });
                });
            }),
        );

        reply.status(result.status);
        return result.body;
    });
}
