import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: ['./error', './adapter', './orchestrator', './gateway', './test'],
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
            'codec.openapi': {
                namespace: {
                    time: [
                        'core/test/api/world-time.json',
                        'core/test/api/world-time.operations.json',
                    ],
                    k8s: [
                        'core/test/api/k8s-apps.json',
                        'core/test/api/k8s-discovery.json',
                        'core/test/api/k8s-version.json',
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
    integration: {
        test: true,
    },
}));
