import type {IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';
import {randomUUID} from 'node:crypto';

/**
 * Create a test participant (DFSP).
 *
 * Generates a unique participant name and creates it with the Admin API.
 * Also creates required accounts (POSITION and SETTLEMENT) and sets initial limits.
 *
 * @param name - Optional DFSP name (defaults to random UUID-based name)
 * @param currency - ISO 4217 currency code (defaults to USD)
 * @param initialLimit - Initial NET_DEBIT_CAP limit (defaults to 1000000)
 * @returns Created participant details with name, currency, and accountIds
 */
export default handler(
    ({handler: {adminParticipantCreate, adminAccountCreate, adminLimitSet}}) => ({
        async provisionParticipantCreate(
            {
                name = `test-dfsp-${randomUUID().substring(0, 8)}`,
                currency = 'USD',
                initialLimit = 1000000,
            }: {
                name?: string;
                currency?: string;
                initialLimit?: number;
            } = {},
            $meta: IMeta,
        ) {
            // Create participant
            const participant = await adminParticipantCreate(
                {
                    name,
                    currency,
                },
                $meta,
            );

            // Create position account
            const positionAccount = await adminAccountCreate(
                {
                    name,
                    account: {
                        currency,
                        type: 'POSITION',
                    },
                },
                $meta,
            );

            // Create settlement account
            const settlementAccount = await adminAccountCreate(
                {
                    name,
                    account: {
                        currency,
                        type: 'SETTLEMENT',
                    },
                },
                $meta,
            );

            // Set NET_DEBIT_CAP limit
            await adminLimitSet(
                {
                    name,
                    limit: {
                        currency,
                        type: 'NET_DEBIT_CAP',
                        value: initialLimit,
                    },
                },
                $meta,
            );

            return {
                name,
                currency,
                isActive: (participant as any).isActive,
                accounts: {
                    position: positionAccount,
                    settlement: settlementAccount,
                },
                limit: initialLimit,
            };
        },
    }),
);
