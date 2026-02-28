import {adapter} from '@feasibleone/blong';

export default adapter(blong => ({
    extends: 'adapter.knex',

    validation: blong.type.Object({
        namespace: blong.type.Union([blong.type.String(), blong.type.Array(blong.type.String())]),
        imports: blong.type.Union([
            blong.type.String(),
            blong.type.Object({
                test: blong.type.Function([blong.type.String()], blong.type.Boolean()),
            }),
            blong.type.Array(
                blong.type.Union([
                    blong.type.String(),
                    blong.type.Object({
                        test: blong.type.Function([blong.type.String()], blong.type.Boolean()),
                    }),
                ]),
            ),
        ]),
        logLevel: blong.type.Optional(blong.type.String()),
    }),

    activation: {
        default: {
            namespace: 'db/$subject',
            imports: '$subject.db',
        },
    },
}));
