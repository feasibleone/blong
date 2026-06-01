import {adapter} from '@feasibleone/blong';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {schemaItemSchema} from './sql/schemaItemSchema.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default adapter<{
    knex: {
        connection: {
            database: string;
            user: string;
            password: string;
        };
    };
}>(() => ({
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
                    schema_item: {
                        definition: schemaItemSchema,
                        order: 1,
                        dropColumns: true,
                    },
                },
                procedurePaths: [join(__dirname, 'sql/schema')],
            },
        },
    },
}));
