import {handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(({lib: {group}, handler: {sqlSchemaList}}) => ({
    testMysqlQuery: ({name = 'sql query'}: {name?: string}) =>
        group(name)([
            async function schemaList(assert: typeof Assert, {$meta}) {
                const result = await sqlSchemaList({}, $meta);
                assert.ok(Array.isArray(result), 'Return array of schema names');
                assert.ok(
                    result.includes('blong-integration'),
                    'Database "blong-integration" is present in schema list',
                );
                return result;
            },
        ]),
}));
