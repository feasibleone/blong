import {server} from '@feasibleone/blong';

/**
 * blong-sim-tcp: Demonstrates TCP backend simulation using adapter.tcp with listen: true.
 *
 * The payshield realm implements an HSM adapter that connects to a Payshield TCP device.
 * In integration mode, the sim layer starts a mock TCP server that simulates the Payshield
 * device, enabling tests to run without a real HSM.
 */
export default server(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: ['./payshield'],
    config: {
        default: {
            rpcServer: {port: 0},
            gateway: {port: 0},
            payshield: {},
        },
        microservice: {},
        integration: {
            remote: {canSkipSocket: true},
            watch: {
                test: ['test.hsm.generateKey'],
            },
        },
    },
}));
