import {adapter} from '@feasibleone/blong';

export default adapter(blong => ({
    extends: 'adapter.http',
    activation: {
        default: {
            imports: ['codec.openapi'],
        },
        dev: {
            namespace: ['k8s', 'github'],
            logLevel: 'trace',
            'codec.openapi': {
                namespace: {
                    k8s: 'demo.k8s',
                },
            },
        },
    },
}));
