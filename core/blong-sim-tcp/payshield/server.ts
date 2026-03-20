import {realm} from '@feasibleone/blong';

/**
 * Payshield realm: demonstrates TCP backend simulation.
 *
 * In integration mode:
 * - The sim layer starts a mock TCP server (payshieldSim adapter with listen: true)
 *   that simulates a Payshield HSM device on the configured port.
 * - The adapter layer starts a TCP client (tcp adapter) that connects to the sim.
 * - The test layer runs HSM operation tests through the full adapter stack.
 *
 * In production/microservice mode:
 * - The sim layer is not active (only the adapter connects to a real HSM).
 */
export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: ['./error', './sim', './adapter', './orchestrator', './test'],
    config: {
        default: {
            tcp: {
                idleSend: 10000,
                maxReceiveBuffer: 4096,
                host: 'localhost',
                port: 1601,
                namespace: ['payshieldport'],
                imports: ['payshield.tcp'],
                listen: false,
            },
            payshieldSim: {
                port: 1601,
                maxReceiveBuffer: 4096,
                namespace: ['payshieldsim'],
                imports: ['payshield.payshieldsim'],
                listen: true,
            },
        },
        microservice: {
            error: true,
            adapter: true,
            orchestrator: true,
        },
        integration: {
            sim: true,
            test: true,
        },
    },
}));
