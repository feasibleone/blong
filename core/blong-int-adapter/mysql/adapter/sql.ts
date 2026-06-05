import {adapter} from '@feasibleone/blong';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default adapter<{
    knex: {
        connection: {
            database: string;
            user: string;
            password: string;
        };
    };
}>(({schema}) => ({
    extends: 'adapter.knex',
    activation: {
        default: {
            knex: {
                connection: {
                    database: 'blong-integration',
                    user: 'blong-test',
                    password: 'password',
                },
            },
            namespace: 'sql',
            imports: ['mysql.sql'],
            schema: {
                sync: true,
                tables: {
                    item: {
                        definition: schema.mysql.item,
                        order: 1,
                        dropColumns: true,
                    },
                },
                procedurePaths: [join(__dirname, 'sql/schema')],
            },
        },
    },
}));
