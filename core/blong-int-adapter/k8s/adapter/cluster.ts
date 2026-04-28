import {adapter} from '@feasibleone/blong';

export default adapter<{
    k8s: {
        kubeconfig?: string;
        namespace?: string;
    };
}>(api => ({
    extends: 'adapter.k8s',
    activation: {
        default: {
            k8s: {},
            namespace: 'cluster',
            imports: [],
        },
    },
}));
