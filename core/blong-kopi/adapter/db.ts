import {adapter} from '@feasibleone/blong';

export default adapter(blong => ({
    extends: 'adapter.knex',

    validation: blong.type.Object({
        namespace: blong.type.Union([blong.type.String(), blong.type.Array(blong.type.String())]),
        imports: blong.type.Union([blong.type.String(), blong.type.Array(blong.type.String())]),
        logLevel: blong.type.Optional(blong.type.String()),
    }),

    config: {
        default: {
            namespace: 'db/$subject',
            imports: '$subject.db',
        },
    },
}));
