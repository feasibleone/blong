import {type IMeta, handler} from '@feasibleone/blong';

/**
 * Dev-only metered fixture: `meterprobe.credit` (test-only handler).
 *
 * Lives in `adapter/dbTest/` so it is only loaded in the `dev` intent
 * (the db adapter imports `.dbTest` handler groups only under `dev`). Never
 * loaded in production. Routed via the `meterprobe` namespace and metered by
 * the 'Meter Probe Credit' bundle (route config
 * `{bundle: 'Meter Probe Credit', creditCost: 5}`).
 */
export default handler(
    () =>
        async function meterprobeCredit(
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            _params: {probe?: string},
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            _$meta: IMeta,
        ): Promise<{success: boolean; probe: string}> {
            return {success: true, probe: 'credit'};
        },
);
