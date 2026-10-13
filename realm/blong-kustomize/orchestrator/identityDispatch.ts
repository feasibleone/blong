import {orchestrator} from '@feasibleone/blong';

/**
 * orchestrator/identityDispatch.ts — the realm's identity namespace, served locally because the login
 * realm is not loaded (@@F-495).
 */
export default orchestrator(() => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: 'identity',
            imports: [/\.identity$/],
        },
    },
}));
