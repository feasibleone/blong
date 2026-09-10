import {server} from '@feasibleone/blong';

/**
 * index.ts — standalone bootstrap for the kukum realm.
 *
 * Deliberately minimal: `srv` provides the rpc/gateway infrastructure, and
 * `kukum` provides the API. No login/core/access and no database — the kukum
 * API must be usable without any backend so an agent can scaffold a realm
 * before that realm has a schema.
 */
export default server(() => ({
    url: import.meta.url,
    children: [
        async function srv() {
            return import('@feasibleone/blong-server/server.ts');
        },
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
