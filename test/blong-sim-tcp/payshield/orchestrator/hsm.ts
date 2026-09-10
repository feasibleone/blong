import {orchestrator} from '@feasibleone/blong';

/**
 * HSM orchestrator: dispatches HSM operations to the payshield.hsm handler group.
 *
 * Exposes the 'hsm' namespace which is called by gateway and test handlers.
 * The payshield.hsm group contains library functions (generateKey, etc.) that
 * transform business parameters into Payshield protocol calls via the TCP adapter.
 */
export default orchestrator(() => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: ['hsm'],
            imports: ['payshield.hsm'],
        },
    },
}));
