import {server} from '@feasibleone/blong';

/**
 * cli.ts — the suite the `blong-cli` command runs on.
 *
 * There is deliberately no `server.ts` and no `index.ts` here: the `cli` intent
 * switches the gateway, the RPC server, the API gateway, rest-fs, system debug,
 * MCP and the watcher off, so the only thing this suite has to provide is the
 * realm. The `default` config block is what makes the loader instantiate it —
 * without a key under an active intent the child loads but contributes no ports,
 * and there would be nothing to dispatch to.
 */
export default server(() => ({
    url: import.meta.url,
    children: [
        async function text() {
            return import('./text/server.ts');
        },
    ],
    config: {
        default: {text: {}},
        // Nothing to quieten down: the framework's `cli` intent already defaults
        // logging to `warn`, precisely so a command's stdout can carry its result.
        cli: {},
    },
}));
