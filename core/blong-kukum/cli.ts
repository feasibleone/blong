import {server} from '@feasibleone/blong';

/**
 * cli.ts — the suite the `kukum` command runs on.
 *
 * Just the kukum realm. The `cli` intent switches the gateway, RPC server, API
 * gateway, rest-fs, system debug, MCP and watching off and resolves every
 * dispatch in-process, so the rpc/gateway infrastructure that `index.ts` loads
 * for a *served* process is dead weight here — and `server.ts` deliberately does
 * not reuse blong-server's db adapter either, because kukum operates on source
 * files and the live registry rather than on tables.
 *
 * `index.ts` remains the suite for a running suite (`blong`, including `/rpc` and
 * the MCP endpoint); this one exists so the same realm can be driven from a
 * terminal without binding a port.
 */
export default server(() => ({
    url: import.meta.url,
    children: [
        async function kukum() {
            return import('./server.ts');
        },
    ],
    config: {
        // The child needs a config block to be instantiated at all: with a bare
        // `default: {}` the realm loads but contributes no ports, so there is
        // nothing to dispatch to. `index.ts` supplies the same entry under `dev`.
        default: {kukum: {}},
        // No `log`/`apiSchema` entries here: stdout is this command's result
        // channel, and the framework's `cli` intent already quietens its own
        // logging for exactly that reason.
        cli: {},
    },
}));
