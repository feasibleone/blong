import {orchestrator} from '@feasibleone/blong';

/**
 * Test dispatcher for the payshield realm.
 * Registers the 'test' namespace and imports all payshield.test handlers.
 * Activated in integration mode for internal API testing.
 */
export default orchestrator(blong => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {},
        integration: {
            namespace: ['test'],
            imports: ['payshield.test'],
        },
    },
}));
