/**
 * orchestrator/subject.ts — dispatch all configured subject.* calls to the backend.
 */
import {orchestrator} from '@feasibleone/blong';

export default orchestrator(() => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            imports: [/\.subject$/],
            destination: 'db',
        },
    },
}));
