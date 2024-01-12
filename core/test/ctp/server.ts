import {dirname, join} from 'node:path';

import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: ['./adapter', './gateway', './test'],
    default: {},
    dev: {
        parking: {},
        ctp: {},
        demo: {},
        payshield: {
            namespace: 'payshield',
            host: 'hsm.softwaregroup-bg.com',
            port: 1500,
            idleSend: 10000,
            maxReceiveBuffer: 4096,
            format: {
                size: '16/integer',
            },
            imports: 'ctp.payshield',
            'ctp.payshield': {
                headerFormat: '6/string-left-zero',
            },
            listen: false,
        },
        client: {
            port: 1500,
            host: 'localhost',
            tls: {
                ca: join(dirname(import.meta.url.slice(7)), 'ca.crt'),
            },
        },
        server: {
            port: 1500,
            listen: true,
            tls: {
                cert: join(dirname(import.meta.url.slice(7)), 'tls.crt'),
                key: join(dirname(import.meta.url.slice(7)), 'tls.txt'),
            },
        },
    },
    microservice: {
        adapter: true,
        orchestrator: true,
        gateway: true,
    },
    integration: {
        test: true,
    },
}));
