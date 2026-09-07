import {adapter} from '@feasibleone/blong';

/**
 * `k8s-dev` adapter instance — Kubernetes explorer source for the commander
 * dev suite. Namespace `k8s-dev` so `k8s-dev.namespace.list` /
 * `k8s-dev.pod.find` / `k8s-dev.pod.log` reach this instance (default
 * kubeconfig).
 */
export default adapter<{
    k8s: {
        kubeconfig?: string;
        namespace?: string;
    };
}>(() => ({
    extends: 'adapter.k8s',
    activation: {
        default: {
            k8s: {},
            namespace: 'k8s-dev',
            imports: [],
        },
    },
}));
