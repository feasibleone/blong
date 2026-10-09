import {realm} from '@feasibleone/blong';

/**
 * The resource/type graph: a library realm every process carries a copy of, *and* an admin API a
 * deployment publishes — so its role is `both`, declared here rather than in the suite that deploys
 * it (D-433). A realm owns this answer because it is the realm that knows what it is.
 */
export default realm(() => ({
    url: import.meta.url,
    config: {default: {k8s: {k8sRealmRole: 'both'}}},
}));
