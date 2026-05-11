import {orchestrator} from '@feasibleone/blong';

/**
 * Browser-side orchestrator that forwards every `marine.*` call to the backend
 * via the built-in RPC adapter by prepending the `backend` namespace.
 *
 * e.g.  marine.coral.find(params)
 *       → dispatch(params, {method: 'backend.marine.coral.find'})
 *       → RPC adapter strips 'backend.' → POST /rpc/marine/coral/find
 */
export default orchestrator(() => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: ['marine'],
            destination: 'backend',
        },
    },
}));
