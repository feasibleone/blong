import {orchestrator} from '@feasibleone/blong';

/**
 * orchestrator/sessionDispatch.ts — the realm's session namespace, serving the discovery document and
 * the key set a minted session is verified against (@@F-495).
 */
export default orchestrator(() => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: 'session',
            imports: [/\.session$/],
        },
    },
}));
