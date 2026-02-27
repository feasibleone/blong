import {adapter} from '@feasibleone/blong';

export default adapter(blong => ({
    extends: 'adapter.http',
    config: {
        default: {
            imports: ['codec.openapi'],
        },
        dev: {
            namespace: ['time', 'k8s', 'github'],
            logLevel: 'trace',
            'codec.openapi': {
                namespace: {
                    time: [
                        '../api/world-time.yaml',
                        '../api/world-time.operations.yaml',
                        {servers: [{url: 'http://localhost:8080/rest/mocktime'}]},
                    ],
                    k8s: [
                        '../api/k8s-apps.json',
                        '../api/k8s-discovery.json',
                        '../api/k8s-version.json',
                    ],
                },
            },
        },
    },
}));
