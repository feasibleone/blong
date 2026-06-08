import {adapter} from '@feasibleone/blong';

export default adapter<{
    knex: {
        connection: {
            database?: string;
            user?: string;
            password?: string;
        };
    };
    mock?: boolean;
}>(() => ({
    extends: 'adapter.knex',
    activation: {
        default: {
            knex: {
                connection: {
                    database: '${suite}',
                    user: 'blong-test',
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
        },
        microservice: {
            mock: true,
            imports: [/\.model$/, /\.fixture$/],
        },
    },
}));
