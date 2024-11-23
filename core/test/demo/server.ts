import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({
        http: blong.type.Object({}),
    }),
    children: ['./error', './adapter', './orchestrator', './gateway'],
    config: {
        default: {
            http: {
                imports: ['codec.openapi'],
            },
            subjectDispatch: {
                namespace: ['subject', 'clock'],
                imports: ['demo.subject', 'demo.clock'],
                validations: ['demo.subject.validation'],
            },
        },
        dev: {
            http: {
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
        microservice: {
            error: true,
            adapter: true,
            orchestrator: true,
            gateway: true,
        },
        integration: {},
    },
}));
