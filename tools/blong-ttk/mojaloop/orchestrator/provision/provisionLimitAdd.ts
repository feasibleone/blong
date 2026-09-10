import {handler} from '@feasibleone/blong';
import type {IMeta} from '@feasibleone/blong';

/**
 * Set or update position limit for a participant.
 *
 * Controls the maximum net debit position the participant can have.
 * Useful for adjusting limits during test execution.
 *
 * @param name - Participant/DFSP name
 * @param currency - Currency code
 * @param value - Limit value
 * @param type - Limit type (defaults to NET_DEBIT_CAP)
 * @returns Created limit details
 */
export default handler(({handler: {adminLimitSet}}) => ({
    async provisionLimitAdd(
        {
            name,
            currency,
            value,
            type = 'NET_DEBIT_CAP',
        }: {
            name: string;
            currency: string;
            value: number;
            type?: 'NET_DEBIT_CAP';
        },
        $meta: IMeta,
    ) {
        const limit = await adminLimitSet(
            {
                name,
                limit: {
                    currency,
                    type,
                    value,
                },
            },
            $meta,
        );

        return {
            name,
            currency,
            type,
            value,
            limit,
        };
    },
}));
