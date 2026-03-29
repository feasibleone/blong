import {handler} from '@feasibleone/blong';
import type {IMeta} from '@feasibleone/blong';

/**
 * Create a test party (account holder) registered with a DFSP.
 *
 * Generates a unique party identifier and registers it with the specified DFSP.
 * Useful for creating test accounts for P2P transfers.
 *
 * @param fspId - The DFSP/participant name
 * @param partyIdType - Type of identifier (MSISDN, EMAIL, etc.) - defaults to MSISDN
 * @param partyIdentifier - Optional specific identifier (defaults to random 10-digit number)
 * @param currency - Optional currency code
 * @returns Created party details
 */
export default handler(({handler: {adminPartyRegister}}) => ({
    async provisionPartyCreate(
        {
            fspId,
            partyIdType = 'MSISDN',
            partyIdentifier = Math.floor(1000000000 + Math.random() * 9000000000).toString(),
            currency = 'USD',
        }: {
            fspId: string;
            partyIdType?: 'MSISDN' | 'IBAN' | 'EMAIL' | 'BUSINESS' | 'DEVICE' | 'ACCOUNT_ID' | 'ALIAS';
            partyIdentifier?: string;
            currency?: string;
        },
        $meta: IMeta,
    ) {
        const party = await adminPartyRegister(
            {
                partyIdType,
                partyIdentifier,
                fspId,
                currency,
            },
            $meta,
        );

        return {
            partyIdType,
            partyIdentifier,
            fspId,
            currency,
            party,
        };
    },
}));
