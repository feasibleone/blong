import {orchestrator} from '@feasibleone/blong';

export default orchestrator(() => ({
    extends: 'orchestrator.openapi',
    activation: {
        default: {
            logLevel: 'info',
        },
    },
}));
