import {type IMeta, handler} from '@feasibleone/blong';

/**
 * Adjust an application's monthly credit balance mid-month.
 *
 * Wire: `gateway.credit.adjust` — thin wrapper over the Redis
 * `gateway.limit.adjust` (HINCRBY).  External management scripts may equally
 * run `HINCRBY {app:X}:credits:YYYY-MM balance <delta>` directly.
 */
export default handler(
    ({handler: {meterLimitAdjust}}) =>
        async function gatewayCreditAdjust(
            params: {
                applicationId: string;
                delta: number;
                month?: string;
            },
            $meta: IMeta,
        ): Promise<{balance: number}> {
            return meterLimitAdjust<{balance: number}>(
                {
                    applicationId: params.applicationId,
                    delta: params.delta,
                    ...(params.month && {month: params.month}),
                },
                $meta,
            );
        },
);
