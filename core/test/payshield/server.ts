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
                host: 'localhost',
                port: 1601,
            },
            payshieldSim: {
                port: 1601,
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
