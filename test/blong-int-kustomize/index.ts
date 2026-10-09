import {server} from '@feasibleone/blong';

/**
 * index.ts — the suite entry: one realm, and the configuration each intent needs.
 *
 * The `cli` intent is the one this package is mostly used through, and it switches the gateway, the RPC
 * server, the API gateway, rest-fs, system debug, MCP and the watcher off — so the only thing the suite
 * has to provide there is the realm. `default` is what makes the loader instantiate it: without a key
 * under an active intent the child loads but contributes no ports, and there is nothing to dispatch a
 * command to.
 */
export default server(() => ({
    url: import.meta.url,
    children: [
        /** The runbook's steps, as handlers the CLI and the tap groups both reach. */
        async function runbook() {
            return import('./server.ts');
        },
    ],
    config: {
        default: {
            // The realm and the port that attaches its handlers: a port with no key under an active
            // intent is a child that loads and contributes nothing, which reads as an unknown method.
            runbook: {e2e: {}},
            // The tap platform serves, so it needs ports; a `cli` run does not, and that intent turns
            // both off — hence the empty blocks below rather than a port of zero.
            rpcServer: {port: 0},
            gateway: {port: 0},
        },
        // Nothing to add: the realm's own entry names what its command needs, and a layer folder named
        // here would *replace* the discovery that finds it (the loader skips explicit children).
        cli: {runbook: {e2e: {}}},
        integration: {
            runbook: {e2e: {}},
            // Every group the package runs has to be listed here, or the watch runner never executes
            // it and the coverage report says "incomplete" for no visible reason.
            watch: {
                test: ['test.cluster.suite'],
            },
        },
    },
}));
