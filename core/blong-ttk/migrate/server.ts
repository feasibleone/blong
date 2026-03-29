/**
 * Migrate realm - JSON to TypeScript migration tooling
 */

import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: [
        './orchestrator/migrateDispatch',
    ],
    config: {
        default: {},
        microservice: {
            orchestrator: true,
        },
    },
}));
