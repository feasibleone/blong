import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({
        tcp: blong.type.Boolean(),
        http: blong.type.Boolean(),
        kafka: blong.type.Boolean(),
        knex: blong.type.Boolean(),
        mongodb: blong.type.Boolean(),
        server: blong.type.Boolean(),
        webhook: blong.type.Boolean(),
        k8s: blong.type.Boolean(),
        vault: blong.type.Boolean(),
        keycloak: blong.type.Boolean(),
        s3: blong.type.Boolean(),
    }),
    children: ['./server'],
    config: {
        default: {
            tcp: false,
            http: false,
            kafka: false,
            knex: false,
            mongodb: false,
            server: true,
            webhook: false,
            k8s: false,
            vault: false,
            keycloak: false,
            s3: false,
        },
    },
}));
