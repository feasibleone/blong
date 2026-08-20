import {orchestrator} from '@feasibleone/blong';

/**
 * Demo API namespace: `customer` — metered by the 'Customer API' bundle.
 *
 * A dev-only dispatch orchestrator: the `.dev` handler group loads only under
 * the `dev` intent, so the `ports.customer.request` dispatch (to the `db`
 * backend, where the `dbTest` handler lives) never exists in production.
 */
export default orchestrator<{destination?: string}>(() => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: 'customer',
            destination: 'db',
        },
    },
}));
