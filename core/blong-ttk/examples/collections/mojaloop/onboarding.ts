/**
 * Mojaloop Provisioning Test Collection
 *
 * Demonstrates parallel DFSP onboarding with blong-chain.
 * Each DFSP is provisioned independently in parallel.
 */

import type {IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';
import type Assert from 'node:assert';
/* eslint-disable @typescript-eslint/no-explicit-any */

export default handler(
    ({
        lib: {group},
        handler: {provisionParticipantCreate, provisionEndpointAdd, provisionPartyCreate},
    }) => ({
        /**
         * Onboard multiple DFSPs in parallel
         */
        mojaloopOnboarding: ({name = 'DFSP Onboarding'}: {name?: string} = {}, _$meta: IMeta) =>
            group(name)([
                // These run in parallel - no dependencies between them
                async function onboardPayerFsp(assert: typeof Assert, {$meta}: any) {
                    // Create DFSP
                    const dfsp = (await provisionParticipantCreate(
                        {
                            name: 'payerfsp',
                            currency: 'USD',
                            initialLimit: 1000000,
                        },
                        $meta,
                    )) as any;

                    assert.ok(dfsp.name === 'payerfsp');
                    assert.ok(dfsp.accounts.position);
                    assert.ok(dfsp.accounts.settlement);

                    // Register callback endpoints
                    const endpoints = (await provisionEndpointAdd(
                        {
                            name: 'payerfsp',
                            baseUrl: 'http://localhost:5050',
                        },
                        $meta,
                    )) as any;

                    assert.ok(endpoints.endpoints.length > 0);

                    // Create test party
                    const party = (await provisionPartyCreate(
                        {
                            fspId: 'payerfsp',
                            partyIdType: 'MSISDN',
                        },
                        $meta,
                    )) as any;

                    assert.ok(party.partyIdentifier);
                    assert.equal(party.fspId, 'payerfsp');

                    return {dfsp, endpoints, party};
                },

                async function onboardPayeeFsp(assert: typeof Assert, {$meta}: any) {
                    const dfsp = (await provisionParticipantCreate(
                        {
                            name: 'payeefsp',
                            currency: 'USD',
                            initialLimit: 1000000,
                        },
                        $meta,
                    )) as any;

                    assert.ok(dfsp.name === 'payeefsp');

                    const endpoints = (await provisionEndpointAdd(
                        {
                            name: 'payeefsp',
                        },
                        $meta,
                    )) as any;

                    assert.ok(endpoints.endpoints.length > 0);

                    const party = (await provisionPartyCreate(
                        {
                            fspId: 'payeefsp',
                            partyIdType: 'MSISDN',
                        },
                        $meta,
                    )) as any;

                    assert.ok(party.partyIdentifier);

                    return {dfsp, endpoints, party};
                },

                async function onboardHubFsp(assert: typeof Assert, {$meta}: any) {
                    const dfsp = (await provisionParticipantCreate(
                        {
                            name: 'hub',
                            currency: 'USD',
                            initialLimit: 10000000, // Higher limit for hub
                        },
                        $meta,
                    )) as any;

                    assert.ok(dfsp.name === 'hub');

                    // Hub doesn't need callback endpoints or parties

                    return {dfsp};
                },

                // This step waits for all previous steps to complete
                async function verifyOnboarding(
                    assert: typeof Assert,
                    {onboardPayerFsp, onboardPayeeFsp, onboardHubFsp, $meta: _$meta}: any,
                ) {
                    const payer = (await onboardPayerFsp) as any;
                    const payee = (await onboardPayeeFsp) as any;
                    const hub = (await onboardHubFsp) as any;

                    // Verify all DFSPs are created
                    assert.ok(payer.dfsp);
                    assert.ok(payee.dfsp);
                    assert.ok(hub.dfsp);

                    // Verify parties are created for FSPs (not hub)
                    assert.ok(payer.party);
                    assert.ok(payee.party);

                    return {
                        totalDfsps: 3,
                        payer,
                        payee,
                        hub,
                    };
                },
            ]),
    }),
);
