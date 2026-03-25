import {adapter} from '@feasibleone/blong';

export default adapter<{
    knex: {
        connection: {
            database: string;
            user: string;
            password: string;
        };
    };
}>(api => ({
    extends: 'adapter.knex',
    activation: {
        default: {
            knex: {
                connection: {
                    database: 'blong',
                    user: 'test',
                    password: 'password',
                },
            },
            namespace: 'sql',
            imports: ['mysql.sql'],
        },
        dev: {
            knex: {
                connection: {
                    database: 'blong',
                    user: 'test',
                    password: 'password',
                },
            },
        },
    },
}));
