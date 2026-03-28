/**
 * Mojaloop P2P Transfer Test Collection
 *
 * Demonstrates a complete peer-to-peer transfer flow:
 * 1. Party lookup
 * 2. Quote request
 * 3. Transfer execution
 * 4. Callback handling
 */

import type {IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';
import type Assert from 'node:assert';
import {randomUUID} from 'node:crypto';

export default handler(
    ({
        lib: {group},
        handler: {
            partyPartyGet,
            quoteQuoteCreate,
            transferTransferCreate,
            callbackCallbackRegister,
            callbackCallbackWait,
        },
    }) => ({
        /**
         * Execute a P2P transfer with callbacks
         */
        mojaloopP2PTransfer: (
            {
                name = 'P2P Transfer',
                payerFsp = 'payerfsp',
                payeeFsp = 'payeefsp',
                payeeIdentifier = '1234567890',
                amount = '100',
                currency = 'USD',
            }: {
                name?: string;
                payerFsp?: string;
                payeeFsp?: string;
                payeeIdentifier?: string;
                amount?: string;
                currency?: string;
            } = {},
            $meta: IMeta,
        ) =>
            group(name)([
                async function lookupParty(assert: typeof Assert, {$meta}: any) {
                    // Register callback expectation
                    const correlationId = randomUUID();
                    await callbackCallbackRegister(
                        {
                            correlationId,
                            type: 'PUT /parties/{type}/{id}',
                        },
                        $meta,
                    );

                    // Perform party lookup
                    const lookupResponse = (await partyPartyGet(
                        {
                            type: 'MSISDN',
                            id: payeeIdentifier,
                            headers: {
                                'fspiop-source': payerFsp,
                                'fspiop-destination': payeeFsp,
                            },
                        },
                        $meta,
                    )) as any;

                    // Should return 202 Accepted
                    assert.equal(lookupResponse.status, 202);

                    // Wait for callback
                    const partyCallback = (await callbackCallbackWait(
                        {
                            correlationId,
                            timeout: 10000,
                        },
                        $meta,
                    )) as any;

                    assert.equal(partyCallback.status, 200);
                    assert.ok(partyCallback.body.party);
                    assert.equal(partyCallback.body.party.partyIdInfo.fspId, payeeFsp);

                    return {
                        party: partyCallback.body.party,
                        payeeIdentifier,
                    };
                },

                async function requestQuote(assert: typeof Assert, {lookupParty, $meta}: any) {
                    const {party} = (await lookupParty) as any;
                    const quoteId = randomUUID();
                    const transactionId = randomUUID();

                    // Register callback expectation
                    const correlationId = randomUUID();
                    await callbackCallbackRegister(
                        {
                            correlationId,
                            type: 'PUT /quotes/{id}',
                        },
                        $meta,
                    );

                    // Request quote
                    const quoteResponse = (await quoteQuoteCreate(
                        {
                            quoteId,
                            transactionId,
                            payee: party,
                            payer: {
                                partyIdInfo: {
                                    partyIdType: 'MSISDN',
                                    partyIdentifier: '0987654321',
                                    fspId: payerFsp,
                                },
                            },
                            amountType: 'SEND',
                            amount: {
                                amount,
                                currency,
                            },
                            transactionType: {
                                scenario: 'TRANSFER',
                                initiator: 'PAYER',
                                initiatorType: 'CONSUMER',
                            },
                            headers: {
                                'fspiop-source': payerFsp,
                                'fspiop-destination': payeeFsp,
                            },
                        },
                        $meta,
                    )) as any;

                    assert.equal(quoteResponse.status, 202);

                    // Wait for callback
                    const quoteCallback = (await callbackCallbackWait(
                        {
                            correlationId,
                            timeout: 10000,
                        },
                        $meta,
                    )) as any;

                    assert.equal(quoteCallback.status, 200);
                    assert.ok(quoteCallback.body.transferAmount);
                    assert.ok(quoteCallback.body.ilpPacket);
                    assert.ok(quoteCallback.body.condition);

                    return {
                        quoteId,
                        transactionId,
                        transferAmount: quoteCallback.body.transferAmount,
                        ilpPacket: quoteCallback.body.ilpPacket,
                        condition: quoteCallback.body.condition,
                        expiration: quoteCallback.body.expiration,
                    };
                },

                async function executeTransfer(assert: typeof Assert, {requestQuote, $meta}: any) {
                    const quote = (await requestQuote) as any;
                    const transferId = randomUUID();

                    // Register callback expectation
                    const correlationId = randomUUID();
                    await callbackCallbackRegister(
                        {
                            correlationId,
                            type: 'PUT /transfers/{id}',
                        },
                        $meta,
                    );

                    // Execute transfer
                    const transferResponse = (await transferTransferCreate(
                        {
                            transferId,
                            payerFsp,
                            payeeFsp,
                            amount: quote.transferAmount,
                            ilpPacket: quote.ilpPacket,
                            condition: quote.condition,
                            expiration: quote.expiration,
                            headers: {
                                'fspiop-source': payerFsp,
                                'fspiop-destination': payeeFsp,
                            },
                        },
                        $meta,
                    )) as any;

                    assert.equal(transferResponse.status, 202);

                    // Wait for callback
                    const transferCallback = (await callbackCallbackWait(
                        {
                            correlationId,
                            timeout: 10000,
                        },
                        $meta,
                    )) as any;

                    assert.equal(transferCallback.status, 202);
                    assert.equal(transferCallback.body.transferState, 'COMMITTED');
                    assert.ok(transferCallback.body.fulfilment);

                    return {
                        transferId,
                        transferState: transferCallback.body.transferState,
                        fulfilment: transferCallback.body.fulfilment,
                        completedTimestamp: transferCallback.body.completedTimestamp,
                    };
                },

                async function verifyTransfer(
                    assert: typeof Assert,
                    {executeTransfer, $meta}: any,
                ) {
                    const transfer = (await executeTransfer) as any;

                    // Verify final state
                    assert.equal(transfer.transferState, 'COMMITTED');
                    assert.ok(transfer.fulfilment);
                    assert.ok(transfer.completedTimestamp);

                    return {
                        success: true,
                        transfer,
                    };
                },
            ]),
    }),
);
