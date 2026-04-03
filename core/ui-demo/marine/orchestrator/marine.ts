/**
 * orchestrator/marine.ts — marine realm browser orchestrator.
 *
 * Forwards every `marine.*` method call to the backend via the built-in
 * RPC adapter by prepending the `backend` namespace prefix.
 *
 * e.g.  marine.coral.find(params)
 *       → dispatch(params, {method: 'backend.marine.coral.find'})
 *       → RPC adapter strips 'backend.' → POST /rpc/marine/coral/find
 *
 * Uses `appendNamespace: 'backend'` (dot-based prefix) so that the
 * receiving RPC adapter can strip it via `stripNamespace: 1`.
 */
import {orchestrator} from '@feasibleone/blong';

export default orchestrator(() => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: ['marine'],
            appendNamespace: 'backend',
        },
    },
}));
