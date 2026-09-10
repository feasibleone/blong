import {type IMeta, handler} from '@feasibleone/blong';

/**
 * Demo metered API: `vision.compute` (test-only handler).
 *
 * Lives in `adapter/dbTest/` so it is only loaded in the `dev` intent
 * (the db adapter imports `.dbTest` handler groups only under `dev`). Never
 * loaded in production. Routed via the `vision` namespace and metered by the
 * 'Vision AI' bundle (route config `{bundle: 'Vision AI', creditCost: 5}`).
 */
export default handler(
    () =>
        async function visionCompute(
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            _params: {imageUrl?: string},
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            _$meta: IMeta,
        ): Promise<{success: boolean; vision: string}> {
            return {success: true, vision: 'computed'};
        },
);
