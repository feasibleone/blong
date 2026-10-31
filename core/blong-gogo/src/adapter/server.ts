import {realm} from '@feasibleone/blong/types';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({
        tcp: blong.type.Boolean(),
        http: blong.type.Boolean(),
        redis: blong.type.Boolean(),
        kafka: blong.type.Boolean(),
        knex: blong.type.Boolean(),
        mongodb: blong.type.Boolean(),
        server: blong.type.Boolean(),
        webhook: blong.type.Boolean(),
        k8s: blong.type.Boolean(),
        vault: blong.type.Boolean(),
        keycloak: blong.type.Boolean(),
        s3: blong.type.Boolean(),
        slack: blong.type.Boolean(),
        viber: blong.type.Boolean(),
        agent: blong.type.Boolean(),
        workspace: blong.type.Boolean(),
        github: blong.type.Boolean(),
    }),
    /**
     * The bases are prototypes: a realm instance reaches one with `extends`, and nothing else does.
     *
     * `thunk` scans the folder without importing it and registers each `<name>.ts` — with the
     * `<name>/` group that gives it its methods — behind a lazy entry, so a process pays for the
     * adapters it actually extends and starts rather than for every base the framework ships
     * (`@@T-593`).
     */
    thunk: ['./server'],
    config: {
        default: {
            tcp: false,
            http: false,
            redis: false,
            kafka: false,
            knex: false,
            mongodb: false,
            server: true,
            webhook: false,
            k8s: false,
            vault: false,
            keycloak: false,
            s3: false,
            slack: false,
            viber: false,
            agent: false,
            workspace: false,
            github: false,
        },
    },
}));
