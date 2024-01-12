import {createRequire} from 'node:module';

import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    pkg: createRequire(import.meta.url)('./package.json'),
    default: {
        login: {
            expire: {
                code: 60, // 1 minute
                access: 15 * 60, // 15 minutes
                cookie: 8 * 60 * 60, // 8 hours
                refresh: 8 * 60 * 60, // 8 hours
                nonce: 15 * 60, // 15 minute
            },
            cookie: {
                encoding: 'none',
                isSecure: true,
                isHttpOnly: true,
                clearInvalid: false,
                strictHeader: true,
            },
        },
        http: {
            imports: ['codec.openapi'],
        },
        loginDispatch: {
            namespace: 'login',
            imports: ['demo.login'],
            validations: ['demo.login.validation'],
        },
        subjectDispatch: {
            namespace: 'subject',
            imports: ['demo.subject'],
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
    validation: blong.type.Object({}),
    url: import.meta.url,
    children: ['./error', './adapter', './orchestrator', './gateway', './test'],
}));
