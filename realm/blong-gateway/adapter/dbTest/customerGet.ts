import {type IMeta, handler} from '@feasibleone/blong';

/**
 * Demo metered API: `customer.get` (test-only handler).
 *
 * Lives in `adapter/dbTest/` so it is only loaded in the `dev` intent
 * (the db adapter imports `.dbTest` handler groups only under `dev`). Never
 * loaded in production. Routed via the `customer` namespace and metered by the
 * 'Customer' bundle (route config `{bundle: 'Customer API', creditCost: 1}`).
 */
export default handler(
    () =>
        async function customerGet(
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            _params: {customerId?: string},
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            _$meta: IMeta,
        ): Promise<{success: boolean; customer: string}> {
            return {success: true, customer: 'demo'};
        },
);
