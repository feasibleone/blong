import {orchestrator} from '@feasibleone/blong';

/**
 * Demo API namespace: `vision` — metered by the 'Vision AI' bundle.
 *
 * A dev-only dispatch orchestrator: the `.dev` handler group loads only under
 * the `dev` intent, so the `ports.vision.request` dispatch (to the `db`
 * backend, where the `dbTest` handler lives) never exists in production.
 */
export default orchestrator<{destination?: string}>(() => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: 'vision',
            destination: 'db',
        },
    },
}));
