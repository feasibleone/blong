import {adapter} from '@feasibleone/blong';

export default adapter<{
    knex: {
        connection: {
            database?: string;
            user?: string;
            password?: string;
        };
    };
}>(() => ({
    extends: 'adapter.knex',
    activation: {
        default: {
            mock: {},
            knex: {
                connection: {
                    database: '${suite}',
                    user: 'blong-admin',
                    password: 'password',
                },
            },
            namespace: 'db',
            imports: [/\.db$/],
        },
        ci: {
            knex: {
                connection: {
                    database: '${suite}',
                },
            },
        },
        dev: {
            knex: {
                connection: {
                    database:
                        '${[suite, user].map(s => s.toLowerCase().replace(/[^a-z0-9-]/g, "_")).join("-")}',
                },
            },
            schema: {
                sync: true,
                seed: true,
                dbTest: true,
                dropColumns: true,
            },
        },
        upgrade: {
            schema: {
                sync: true,
                seed: true,
            },
        },
        microservice: {
            imports: [/\.db$/, /\.model$/, /\.fixture$/],
        },
    },
}));
