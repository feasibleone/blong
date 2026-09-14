/**
 * Payee DFSP — the far end.
 *
 * The last participant in the chain; its failure is the one that must be
 * attributed as the origin (PRD R15).
 *
 * Both faults here are deployment properties the participant is installed with
 * (`blockTransfers`, `stallTransfers`) rather than branches a test steers it
 * into: the file still reads like a real payee that happens to be configured
 * that way (Plan 3 decision 2).
 *
 * The status is set on the reply explicitly; a returned `{status, body}` object
 * would be answered with HTTP 200 by fastify, so a refusal could never reach the
 * hub and R15's origin would be the hub's own timeout instead of this service
 * (see `payer.ts` for the full note).
 */

import type {Participant} from './participant.ts';

export interface PayeeOptions {
    /** Refuse every transfer, as a blocked account would (fault F1). */
    blockTransfers?: boolean;
    /** Never answer the transfer, as a hung downstream would (fault F4). */
    stallTransfers?: boolean;
    stallMs?: number;
}

export function installPayee(participant: Participant, options: PayeeOptions = {}): void {
    const {logger, app} = participant;

    app.post('/parties', async (request, reply) => {
        const traceId = participant.traceFrom(request);
        const flowId = participant.flowFrom(request);
        const result = await participant.run(traceId, flowId, () =>
            participant.phase('discovery', async () => {
                logger.info('party profile returned', {currency: 'EUR'});
                return {status: 200, body: {currency: 'EUR'}};
            }),
        );
        reply.status(result.status);
        return result.body;
    });

    app.post('/quotes', async (request, reply) => {
        const traceId = participant.traceFrom(request);
        const flowId = participant.flowFrom(request);
        const result = await participant.run(traceId, flowId, () =>
            participant.phase('quote', async () => {
                logger.info('quote signed', {condition: 'sha256:condition'});
                return {status: 200, body: {condition: 'sha256:condition'}};
            }),
        );
        reply.status(result.status);
        return result.body;
    });

    app.post('/transfers', async (request, reply) => {
        const traceId = participant.traceFrom(request);
        const flowId = participant.flowFrom(request);
        const result = await participant.run(traceId, flowId, () =>
            participant.phase('transfer', async () => {
                if (options.stallTransfers) {
                    logger.warn('transfer awaiting fulfilment', {waitedMs: options.stallMs ?? 50});
                    await new Promise(resolve => setTimeout(resolve, options.stallMs ?? 50));
                    return {status: 504, body: {reason: 'no fulfilment'}};
                }
                if (options.blockTransfers) {
                    logger.error('transfer refused', {err: {message: 'account blocked'}});
                    return {status: 422, body: {reason: 'account blocked'}};
                }
                logger.info('transfer fulfilled', {res: {status: 200}});
                return {status: 200, body: {fulfilment: 'sha256:preimage'}};
            }),
        );
        reply.status(result.status);
        return result.body;
    });
}
