import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    validation: blong.type.Object({
        tcp: blong.type.Object({}),
        payshieldSim: blong.type.Object({}),
    }),
    url: import.meta.url,
    children: ['./error', './sim', './adapter', './orchestrator', './gateway'],
    config: {
        default: {
            tcp: {
                idleSend: 10000,
                maxReceiveBuffer: 4096,
                format: {
                    size: '16/integer',
                    headerFormat: '6/string-left-zero',
                },
                host: 'hsm.localhost',
                port: 1601,
                namespace: ['payshieldport'],
                imports: ['payshield.tcp'],
                listen: false,
            },
            payshieldSim: {
                port: 1601,
                maxReceiveBuffer: 4096,
                format: {
                    size: '16/integer',
                    headerFormat: '6/string-left-zero',
                    messageFormat: {
                        generateKey: {
                            requestPattern:
                                'mode:1/string, keyType:3/string, keySchemeLmk:1/string',
                        },
                    },
                },
                namespace: ['payshieldsim'],
                listen: true,
            },
        },
        dev: {
            tcp: {
                // host: 'hsm.softwaregroup-bg.com',
                // port: 1500
            },
        },
        test: {},
        microservice: {
            error: true,
            adapter: true,
            orchestrator: true,
            gateway: true,
        },
        integration: {
            sim: true,
        },
    },
}));
