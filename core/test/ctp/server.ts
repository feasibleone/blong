import { createRequire } from 'node:module';

import { realm } from '@feasibleone/blong';

export default realm(fo => ({
    pkg: createRequire(import.meta.url)('./package.json'),
    default: {},
    dev: {
        payshield: {
            namespace: 'payshield',
            host: 'hsm.softwaregroup-bg.com',
            port: 1500,
            idleSend: 10000,
            maxReceiveBuffer: 4096,
            format: {
                size: '16/integer'
            },
            imports: 'ctp.payshield',
            'ctp.payshield': {
                headerFormat: '6/string-left-zero'
            },
            listen: false
        }
    },
    microservice: {
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
        './adapter',
        './gateway',
        './test'
    ]
}));
