import {server} from '@feasibleone/blong';

/**
 * index.ts — standalone bootstrap for the kukum realm.
 *
 * Deliberately minimal: `srv` (the framework realm that provides the rpc/gateway
 * infrastructure) is loaded from this package's manifest by `frameworkRealms`, so
 * only `kukum` is a child. The `dev` block still gives `srv` its config slot. No
 * login/core/access and no database — the kukum API must be usable without any
 * backend so an agent can scaffold a realm before that realm has a schema.
 */
export default server(() => ({
    url: import.meta.url,
    children: [
        async function kukum() {
            return import('./server.ts');
        },
    ],
    config: {
        default: {},
        dev: {
            srv: {},
            kukum: {},
            // Expose the kukum API as MCP tools at /mcp for local agents.
            // Framework default is off; enabling it here scopes it to this suite.
            mcp: {enabled: true, name: 'blong-kukum'},
        },
        integration: {
            watch: {
                test: [],
            },
        },
    },
}));
