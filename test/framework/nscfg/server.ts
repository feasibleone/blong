import {server} from '@feasibleone/blong';

export default server(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: ['./nscfg'],
    config: {
        default: {
            rpcServer: {
                port: 0,
            },
            gateway: {
                port: 0,
            },
        },
        integration: {
            nscfg: {
                // Declared by the suite for its child, never by the realm's own
                // source: the loader must accept a key the parent gave the module,
                // or a realm that reads its configuration from its suite — how a
                // suite tells a realm what its pages render — fails to start
                // (@@D-554).
                fromSuite: 'suite-value',
            },
            watch: {
                test: ['test.cfg.get'],
            },
        },
    },
}));
