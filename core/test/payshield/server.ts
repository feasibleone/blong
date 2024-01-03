import { createRequire } from 'node:module';

import { realm } from '@feasibleone/blong';

export default realm(fo => ({
    pkg: createRequire(import.meta.url)('./package.json'),
    default: {
        tcp: {
            idleSend: 10000,
            maxReceiveBuffer: 4096,
            format: {
                size: '16/integer',
                headerFormat: '6/string-left-zero'
            },
            port: 1500,
            namespace: ['payshieldport'],
            imports: ['payshield.tcp'],
            listen: false
        }
    },
    dev: {
        tcp: {
            host: 'hsm.softwaregroup-bg.com'
        }
    },
    microservice: {
        error: true,
        adapter: true,
        orchestrator: true,
        gateway: true
    },
    integration: {
        test: true
    },
    validation: fo.Type.Object({}),
    url: import.meta.url,
    children: [
        './error',
        './adapter',
        './orchestrator',
        './gateway',
        './test'
    ]
}));
