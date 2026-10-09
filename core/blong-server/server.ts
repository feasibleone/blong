import {realm} from '@feasibleone/blong';

export default realm(() => ({
    url: import.meta.url,
    config: {
        default: {
            // What this realm *is* in a deployment: every microservice repeats the DB adapter and
            // subject orchestrator pair, so a deployment carries it rather than publishing it as a
            // service of its own. Declared on the realm rather than in the suite that deploys it,
            // because the realm knows its role and the name it was loaded under may vary (D-433).
            k8s: {k8sRealmRole: 'companion'},
        },
        dev: {
            adapter: {},
        },
    },
}));
