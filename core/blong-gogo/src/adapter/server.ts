import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({
        tcp: blong.type.Boolean(),
        http: blong.type.Boolean(),
        kafka: blong.type.Boolean(),
        knex: blong.type.Boolean(),
        server: blong.type.Boolean(),
        webhook: blong.type.Boolean(),
    }),
    children: ['./server'],
    config: {
        default: {
            tcp: false,
            http: false,
            kafka: false,
            knex: false,
            server: true,
            webhook: false,
        },
    },
}));
