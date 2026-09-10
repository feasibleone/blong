import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: [
        // blong-core brings the resource/type/triple graph schema so the knex
        // adapter tests can exercise the resource-backed CRUD + graph-edge
        // features (core_resource / core_type / core_triple tables).
        async function core() {
            return import('@feasibleone/blong-core/server.ts');
        },
        './test',
    ],
    config: {
        default: {
            // The `core` child realm (resource/type/triple graph) — the config
            // block gates its activation (a child with no config block is skipped).
            core: {},
        },
        microservice: {
            adapter: true,
        },
        'adapter.mysql': {
            adapter: true,
            test: true,
        },
    },
}));
