import {adapter} from '@feasibleone/blong';

/**
 * adapter/cluster.ts — the realm's window on the Kubernetes API.
 *
 * A thin wrapper over the framework's `adapter.k8s`: it only names the local
 * handler group (`cluster`) and points the client at the cluster. The realm
 * never talks to the API server directly, so the UI and the deployer reach the
 * cluster through one place — and one ServiceAccount/RBAC decision.
 *
 * In-cluster the default service account token and `KUBERNETES_SERVICE_HOST`
 * are enough; locally, `kubeconfig` names the file. Nothing here opens a
 * connection at load time: `adapter.k8s` builds its clients lazily.
 */
export default adapter<{
    k8s: {
        kubeconfig?: string;
        context?: string;
        namespace?: string;
    };
}>(() => ({
    extends: 'adapter.k8s',
    activation: {
        default: {
            k8s: {},
            namespace: 'cluster',
            imports: [],
        },
    },
}));
