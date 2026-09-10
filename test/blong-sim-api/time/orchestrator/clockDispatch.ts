import {orchestrator} from '@feasibleone/blong';

/**
 * Clock orchestrator: dispatches time-related operations.
 *
 * Exposes the 'clock' namespace with two types of handlers:
 * - clockGet: pure local implementation (reads system time directly)
 * - timeGet: calls the external world-time API via the HTTP adapter
 */
export default orchestrator(() => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: ['clock'],
            imports: ['time.clock'],
        },
    },
}));
