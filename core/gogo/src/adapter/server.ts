import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: ['./server'],
    default: {
        tcp: false,
        http: false,
        kafka: false,
        knex: false,
        server: true,
    },
}));
